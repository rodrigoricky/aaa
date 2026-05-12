"use strict";
/**
 * diagnose-qa.ts
 *
 * Read-only diagnostic script for investigating a Quantity Adjustment record.
 * Prints the stored old_qty / adjust_qty / new_qty for every detail line,
 * the live items.end_qty for each item, and flags any inconsistencies.
 *
 * Usage:
 *   npm run diagnose:qa "<QA-NUMBER>"
 *   e.g.  npm run diagnose:qa "QA-2024-00001"
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const sql_server_js_1 = require("../shared/database/sql-server.js");
const env_js_1 = require("../config/env.js");
function fmt(value) {
    if (value == null)
        return 'NULL  ⚠';
    return Number(value).toFixed(2);
}
function flag(value, label) {
    if (value == null)
        return ` ← NULL treated as 0 by toNumber()  ⚠ (${label})`;
    if (Number(value) === 0)
        return ` ← zero  ⚠ (${label})`;
    return '';
}
async function diagnoseQa(qaNo) {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    // ── 1. Header ─────────────────────────────────────────────────────────────
    const headerResult = await pool
        .request()
        .input('qaNo', sql_server_js_1.sql.NVarChar, qaNo)
        .query(`
      SELECT
        qa_id,
        qa_no,
        status,
        ref_type,
        ref_no,
        created_by_username,
        created_at,
        updated_at,
        posted_at,
        posted_by_username
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
      WHERE qa_no = @qaNo
    `);
    if (headerResult.recordset.length === 0) {
        console.error(`\nNo QA record found with qa_no = "${qaNo}"`);
        console.error('Tip: QA numbers are case-sensitive. Try "QA-2024-00001".');
        process.exitCode = 1;
        return;
    }
    const header = headerResult.recordset[0];
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log(`║  QA DIAGNOSIS: ${header.qa_no.padEnd(36)}║`);
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log();
    console.log('  QA No:    ', header.qa_no);
    console.log('  Status:   ', header.status);
    console.log('  Ref:      ', `${header.ref_type}-${header.ref_no}`);
    console.log('  Created:  ', `${header.created_by_username} at ${header.created_at.toISOString()}`);
    if (header.posted_at) {
        console.log('  Posted:   ', `${header.posted_by_username ?? '?'} at ${header.posted_at.toISOString()}`);
    }
    // ── 2. Detail lines ───────────────────────────────────────────────────────
    const detailResult = await pool
        .request()
        .input('qaId', sql_server_js_1.sql.BigInt, header.qa_id)
        .query(`
      SELECT
        line_no,
        itemcode,
        itemname,
        old_qty,
        adjust_qty,
        new_qty,
        entry_mode,
        requested_qty,
        item_remark
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_detail]
      WHERE qa_id = @qaId
      ORDER BY line_no ASC
    `);
    const details = detailResult.recordset;
    if (details.length === 0) {
        console.log('\n  (no detail lines found)');
        return;
    }
    // ── 3. Live item quantities ───────────────────────────────────────────────
    const itemcodes = details.map((d) => d.itemcode);
    const req = pool.request();
    const placeholders = itemcodes.map((code, i) => {
        req.input(`code${i}`, sql_server_js_1.sql.NVarChar, code);
        return `@code${i}`;
    });
    const itemResult = await req.query(`
    SELECT
      itemcode,
      itemname,
      end_qty,
      END_QTY_TEMP,
      ASSEMBLY_QTY
    FROM items
    WHERE itemcode IN (${placeholders.join(', ')})
  `);
    const liveItems = new Map(itemResult.recordset.map((r) => [r.itemcode, r]));
    // ── 4. Print detail table ─────────────────────────────────────────────────
    let zeroOldQtyLines = [];
    let nullEndQtyLines = [];
    let mathMismatchLines = [];
    console.log('\n──────────────────────────────────────────────────────');
    console.log('  DETAIL LINES');
    console.log('──────────────────────────────────────────────────────');
    for (const detail of details) {
        const storedOldQty = detail.old_qty == null ? null : Number(detail.old_qty);
        const storedAdjQty = detail.adjust_qty == null ? null : Number(detail.adjust_qty);
        const storedNewQty = detail.new_qty == null ? null : Number(detail.new_qty);
        const requestedQty = detail.requested_qty == null ? null : Number(detail.requested_qty);
        const entryMode = detail.entry_mode === 'SET' ? 'SET' : 'DELTA';
        const effectiveOldQty = storedOldQty ?? 0;
        const effectiveAdjQty = storedAdjQty ?? 0;
        const effectiveNewQty = storedNewQty ?? 0;
        const liveItem = liveItems.get(detail.itemcode);
        const liveEndQty = liveItem ? liveItem.end_qty : undefined;
        // Math check: stored new_qty should equal stored old_qty + adjust_qty (DELTA) or requested_qty (SET)
        const expectedNewQty = entryMode === 'SET'
            ? (requestedQty ?? effectiveOldQty + effectiveAdjQty)
            : effectiveOldQty + effectiveAdjQty;
        const mathOk = Math.abs(effectiveNewQty - expectedNewQty) < 0.005;
        const zeroOldFlag = storedOldQty === 0;
        if (zeroOldFlag)
            zeroOldQtyLines.push(detail.itemcode);
        if (liveEndQty == null)
            nullEndQtyLines.push(detail.itemcode);
        if (!mathOk)
            mathMismatchLines.push(detail.itemcode);
        console.log();
        console.log(`  Line ${detail.line_no}: [${detail.itemcode}] ${detail.itemname}`);
        console.log(`    Stored old_qty:    ${fmt(detail.old_qty)}${flag(detail.old_qty, 'current qty at save/post time')}`);
        console.log(`    Stored adjust_qty: ${fmt(detail.adjust_qty)}`);
        console.log(`    Stored new_qty:    ${fmt(detail.new_qty)}`);
        console.log(`    Entry mode:        ${entryMode}${detail.entry_mode == null ? '  (null → defaulted to DELTA)' : ''}`);
        console.log(`    Requested qty:     ${requestedQty != null ? requestedQty.toFixed(2) : 'NULL (pre-migration record)'}`);
        console.log(`    Math consistent:   ${mathOk ? 'YES' : 'NO  ⚠  expected new_qty = ' + expectedNewQty.toFixed(2)}`);
        if (!liveItem) {
            console.log(`    Live item:         ITEM NOT FOUND IN items TABLE  ⚠`);
        }
        else {
            console.log(`    Live end_qty:      ${fmt(liveEndQty)}${liveEndQty == null ? '' : ''}`);
            console.log(`    Live END_QTY_TEMP: ${fmt(liveItem.END_QTY_TEMP)}`);
            console.log(`    Live ASSEMBLY_QTY: ${fmt(liveItem.ASSEMBLY_QTY)}`);
        }
        if (detail.item_remark) {
            console.log(`    Remark:            ${detail.item_remark}`);
        }
    }
    // ── 5. Summary ────────────────────────────────────────────────────────────
    console.log('\n──────────────────────────────────────────────────────');
    console.log('  SUMMARY');
    console.log('──────────────────────────────────────────────────────');
    console.log(`  Total lines:                ${details.length}`);
    console.log(`  Lines with old_qty = 0:     ${zeroOldQtyLines.length}${zeroOldQtyLines.length > 0 ? '  ⚠' : ''}`);
    console.log(`  Items with live end_qty NULL:${nullEndQtyLines.length}${nullEndQtyLines.length > 0 ? '  ⚠' : ''}`);
    console.log(`  Lines with math mismatch:   ${mathMismatchLines.length}${mathMismatchLines.length > 0 ? '  ⚠' : ''}`);
    if (zeroOldQtyLines.length > 0) {
        console.log();
        console.log('  ⚠ ZERO OLD_QTY DETECTED');
        console.log('  Affected items: ' + zeroOldQtyLines.join(', '));
        console.log();
        console.log('  Possible causes:');
        console.log('    A. items.end_qty was NULL in the DB at save/post time');
        console.log('       → toNumber(null) silently returns 0 in the backend');
        console.log('    B. items.end_qty was genuinely 0 at save/post time');
        console.log('       → System behaviour is correct; stock was already at 0');
        console.log();
        console.log('  To distinguish A from B, check what the current live end_qty is');
        console.log('  for these items, and verify with physical stock count.');
    }
    if (nullEndQtyLines.length > 0) {
        console.log();
        console.log('  ⚠ NULL end_qty IN LIVE items TABLE');
        console.log('  Affected items: ' + nullEndQtyLines.join(', '));
        console.log('  These will show as 0.00 on any new QA saved today.');
    }
    if (mathMismatchLines.length > 0) {
        console.log();
        console.log('  ⚠ STORED MATH DOES NOT ADD UP');
        console.log('  Affected items: ' + mathMismatchLines.join(', '));
        console.log('  old_qty + adjust_qty ≠ new_qty — data may have been modified directly in the DB.');
    }
    if (zeroOldQtyLines.length === 0 && nullEndQtyLines.length === 0 && mathMismatchLines.length === 0) {
        console.log('\n  ✓ No anomalies detected.');
    }
    console.log();
}
// ── Entry point ─────────────────────────────────────────────────────────────
const qaNo = process.argv[2]?.trim();
if (!qaNo) {
    console.error('\nUsage:  npm run diagnose:qa "<QA-NUMBER>"');
    console.error('Example: npm run diagnose:qa "QA-2024-00001"\n');
    process.exitCode = 1;
}
else {
    diagnoseQa(qaNo)
        .catch((error) => {
        console.error('\nFatal error:', error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
        .finally(() => (0, sql_server_js_1.closeSqlPool)());
}
