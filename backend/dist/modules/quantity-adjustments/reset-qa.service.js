"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectResetQuantityAdjustments = inspectResetQuantityAdjustments;
exports.resetQuantityAdjustments = resetQuantityAdjustments;
exports.resolveResetQaTargetFromCli = resolveResetQaTargetFromCli;
const env_js_1 = require("../../config/env.js");
const sql_server_js_1 = require("../../shared/database/sql-server.js");
function cleanString(value) {
    return String(value ?? '').trim();
}
function toNumber(value) {
    return Number(value ?? 0);
}
function isResetAllTarget(target) {
    return cleanString(target).toLowerCase() === 'all';
}
function isPostedQaHeader(header) {
    return cleanString(header.status).toUpperCase() === 'POSTED' || header.postedAt != null;
}
function getUniqueValues(values) {
    return [...new Set(values.map((value) => cleanString(value)).filter(Boolean))];
}
function bindStringList(request, values, inputPrefix) {
    return values.map((value, index) => {
        const key = `${inputPrefix}${index}`;
        request.input(key, sql_server_js_1.sql.NVarChar, value);
        return `@${key}`;
    });
}
function mapResetQaHeaderRow(row) {
    return {
        qaId: Number(row.qaId),
        qaNo: cleanString(row.qaNo),
        refType: cleanString(row.refType),
        refNo: cleanString(row.refNo),
        status: cleanString(row.status).toUpperCase(),
        transDate: row.transDate,
        createdAt: row.createdAt,
        postedAt: row.postedAt ?? null,
    };
}
async function loadAllQaHeaders(executor) {
    const result = await executor.request().query(`
    SELECT
      qa_id AS qaId,
      qa_no AS qaNo,
      ref_type AS refType,
      ref_no AS refNo,
      status,
      trans_date AS transDate,
      created_at AS createdAt,
      posted_at AS postedAt
    FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
    ORDER BY
      CASE WHEN status = N'POSTED' THEN 0 ELSE 1 END,
      posted_at DESC,
      created_at DESC,
      qa_id DESC
  `);
    return result.recordset.map(mapResetQaHeaderRow);
}
async function loadMatchingQaHeaders(executor, target) {
    const request = executor.request();
    request.input('target', sql_server_js_1.sql.NVarChar, target);
    const result = await request.query(`
    SELECT
      qa_id AS qaId,
      qa_no AS qaNo,
      ref_type AS refType,
      ref_no AS refNo,
      status,
      trans_date AS transDate,
      created_at AS createdAt,
      posted_at AS postedAt
    FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
    WHERE qa_no = @target
       OR ref_no = @target
       OR CONCAT(ref_type, N'-', ref_no) = @target
    ORDER BY
      CASE WHEN qa_no = @target THEN 0 WHEN CONCAT(ref_type, N'-', ref_no) = @target THEN 1 ELSE 2 END,
      posted_at DESC,
      created_at DESC,
      qa_id DESC
  `);
    return result.recordset.map(mapResetQaHeaderRow);
}
function resolveSpecificQaHeader(headers, target) {
    const cleanedTarget = cleanString(target);
    const exactQaNo = headers.filter((header) => cleanString(header.qaNo) === cleanedTarget);
    if (exactQaNo.length === 1) {
        return exactQaNo[0];
    }
    const exactRef = headers.filter((header) => cleanString(`${header.refType}-${header.refNo}`) === cleanedTarget);
    if (exactRef.length === 1) {
        return exactRef[0];
    }
    const exactRefNo = headers.filter((header) => cleanString(header.refNo) === cleanedTarget);
    if (exactRefNo.length === 1) {
        return exactRefNo[0];
    }
    if (headers.length === 0) {
        throw new Error(`No quantity adjustment found for "${target}".`);
    }
    throw new Error(`Target "${target}" is ambiguous. Matches: ${headers.map((header) => header.qaNo).join(', ')}`);
}
async function loadQaDetailsByIds(executor, qaIds) {
    const uniqueQaIds = [...new Set(qaIds.filter((value) => Number.isInteger(value)))];
    const detailMap = new Map();
    if (uniqueQaIds.length === 0) {
        return detailMap;
    }
    const request = executor.request();
    const placeholders = uniqueQaIds.map((qaId, index) => {
        const key = `qaId${index}`;
        request.input(key, sql_server_js_1.sql.BigInt, qaId);
        return `@${key}`;
    });
    const result = await request.query(`
    SELECT
      qa_id AS qaId,
      itemcode,
      old_qty AS oldQty,
      adjust_qty AS adjustQty,
      new_qty AS newQty
    FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_detail]
    WHERE qa_id IN (${placeholders.join(', ')})
    ORDER BY qa_id DESC, line_no ASC
  `);
    for (const row of result.recordset) {
        const qaId = Number(row.qaId);
        const details = detailMap.get(qaId) ?? [];
        details.push({
            qaId,
            itemcode: cleanString(row.itemcode),
            oldQty: toNumber(row.oldQty),
            adjustQty: toNumber(row.adjustQty),
            newQty: toNumber(row.newQty),
        });
        detailMap.set(qaId, details);
    }
    return detailMap;
}
async function assertNoLaterPostedAdjustments(executor, header, details) {
    if (!isPostedQaHeader(header) || !header.postedAt || details.length === 0) {
        return;
    }
    const itemcodes = getUniqueValues(details.map((detail) => detail.itemcode));
    const request = executor.request();
    request.input('qaId', sql_server_js_1.sql.BigInt, header.qaId);
    request.input('postedAt', sql_server_js_1.sql.DateTime2, header.postedAt);
    const placeholders = bindStringList(request, itemcodes, 'itemcode');
    const result = await request.query(`
    SELECT DISTINCT
      h.qa_no AS qaNo,
      d.itemcode AS itemcode
    FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_header] h
    INNER JOIN [${env_js_1.env.UTILITY_SCHEMA}].[qa_detail] d
      ON d.qa_id = h.qa_id
    WHERE h.status = N'POSTED'
      AND h.qa_id <> @qaId
      AND d.itemcode IN (${placeholders.join(', ')})
      AND (
        h.posted_at > @postedAt
        OR (h.posted_at = @postedAt AND h.qa_id > @qaId)
      )
  `);
    if (result.recordset.length === 0) {
        return;
    }
    const qaNumbers = getUniqueValues(result.recordset.map((row) => cleanString(row.qaNo)));
    const blockedItems = getUniqueValues(result.recordset.map((row) => cleanString(row.itemcode)));
    throw new Error(`Cannot reset ${header.qaNo} because later posted adjustments exist for item(s) ${blockedItems.join(', ')}: ${qaNumbers.join(', ')}`);
}
async function buildQaResetPlan(executor, target) {
    const cleanedTarget = cleanString(target);
    const mode = isResetAllTarget(cleanedTarget) ? 'all' : 'single';
    const headers = mode === 'all'
        ? await loadAllQaHeaders(executor)
        : [resolveSpecificQaHeader(await loadMatchingQaHeaders(executor, cleanedTarget), cleanedTarget)];
    const detailsByQaId = await loadQaDetailsByIds(executor, headers.map((header) => header.qaId));
    if (mode === 'single' && headers[0]) {
        await assertNoLaterPostedAdjustments(executor, headers[0], detailsByQaId.get(headers[0].qaId) ?? []);
    }
    const itemcodes = getUniqueValues(headers.flatMap((header) => (detailsByQaId.get(header.qaId) ?? []).map((detail) => detail.itemcode)));
    return {
        mode,
        target: cleanedTarget,
        headers,
        detailsByQaId,
        summary: {
            mode,
            target: cleanedTarget,
            matchedQaCount: headers.length,
            postedQaCount: headers.filter((header) => isPostedQaHeader(header)).length,
            savedQaCount: headers.filter((header) => !isPostedQaHeader(header)).length,
            affectedItemCount: itemcodes.length,
            qaNumbers: headers.map((header) => cleanString(header.qaNo)),
        },
    };
}
async function restoreInventoryForHeader(transaction, header, details, restoredQuantities) {
    for (const detail of details) {
        const restoredQuantity = detail.newQty - detail.adjustQty;
        const result = await transaction
            .request()
            .input('itemcode', sql_server_js_1.sql.NVarChar, detail.itemcode)
            .input('restoredQty', sql_server_js_1.sql.Decimal(18, 2), restoredQuantity)
            .query(`
        UPDATE items
        SET
          end_qty = @restoredQty,
          END_QTY_TEMP = @restoredQty,
          ASSEMBLY_QTY = @restoredQty,
          date_modified = GETDATE()
        WHERE itemcode = @itemcode
      `);
        if ((result.rowsAffected[0] ?? 0) === 0) {
            throw new Error(`Unable to restore item ${detail.itemcode} while resetting ${header.qaNo}`);
        }
        restoredQuantities.set(detail.itemcode, restoredQuantity);
    }
}
async function deleteInventoryAdjustmentsForHeader(transaction, header, details) {
    if (details.length === 0) {
        return 0;
    }
    let deletedCount = 0;
    for (const detail of details) {
        const result = await transaction
            .request()
            .input('batchNo', sql_server_js_1.sql.NVarChar, cleanString(header.qaNo).slice(-10))
            .input('itemcode', sql_server_js_1.sql.NVarChar, detail.itemcode)
            .query(`
        DELETE TOP (1) FROM inventory_adjustment
        OUTPUT deleted.itemcode AS itemcode
        WHERE machine_id = N'UTILITY'
          AND BATCH_NO = @batchNo
          AND itemcode = @itemcode
      `);
        deletedCount += result.recordset.length;
    }
    return deletedCount;
}
async function deleteQaHeader(transaction, qaId) {
    const result = await transaction
        .request()
        .input('qaId', sql_server_js_1.sql.BigInt, qaId)
        .query(`
      DELETE FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_print_log]
      WHERE qa_id = @qaId;

      DELETE FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_posting_log]
      WHERE qa_id = @qaId;

      DELETE FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_header]
      WHERE qa_id = @qaId;
    `);
    const headerDeleteCount = result.rowsAffected[result.rowsAffected.length - 1] ?? 0;
    if (headerDeleteCount === 0) {
        throw new Error(`Quantity adjustment ${qaId} was not deleted.`);
    }
}
async function inspectResetQuantityAdjustments(target) {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const plan = await buildQaResetPlan(pool, target);
    return plan.summary;
}
async function resetQuantityAdjustments(target) {
    return (0, sql_server_js_1.withTransaction)(async (transaction) => {
        const plan = await buildQaResetPlan(transaction, target);
        const restoredQuantities = new Map();
        let deletedInventoryRows = 0;
        for (const header of plan.headers) {
            const details = plan.detailsByQaId.get(header.qaId) ?? [];
            if (isPostedQaHeader(header)) {
                const deletedCount = await deleteInventoryAdjustmentsForHeader(transaction, header, details);
                deletedInventoryRows += deletedCount;
                await restoreInventoryForHeader(transaction, header, details, restoredQuantities);
            }
            await deleteQaHeader(transaction, header.qaId);
        }
        let nextQaValue = null;
        let numberingReset = false;
        if (plan.mode === 'all') {
            await transaction
                .request()
                .input('nextValue', sql_server_js_1.sql.BigInt, env_js_1.env.QA_NUMBER_START)
                .query(`
          UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering]
          SET
            next_value = @nextValue,
            updated_at = SYSUTCDATETIME()
          WHERE number_key = N'QA'
        `);
            numberingReset = true;
            nextQaValue = env_js_1.env.QA_NUMBER_START;
        }
        return {
            ...plan.summary,
            restoredQuantities: [...restoredQuantities.entries()].map(([itemcode, quantity]) => ({
                itemcode,
                quantity,
            })),
            deletedQaNumbers: plan.summary.qaNumbers,
            deletedInventoryRows,
            numberingReset,
            nextQaValue,
        };
    }, sql_server_js_1.sql.ISOLATION_LEVEL.SERIALIZABLE);
}
function resolveResetQaTargetFromCli(argv = process.argv.slice(2), npmConfigArgv = process.env.npm_config_argv) {
    const directTarget = argv.join(' ').trim();
    if (directTarget) {
        return directTarget;
    }
    if (!npmConfigArgv) {
        return '';
    }
    try {
        const parsed = JSON.parse(npmConfigArgv);
        const original = Array.isArray(parsed.original) ? parsed.original : [];
        const scriptIndex = original.findIndex((value) => value === 'reset:qa');
        if (scriptIndex >= 0 && scriptIndex < original.length - 1) {
            return original.slice(scriptIndex + 1).join(' ').trim();
        }
    }
    catch {
        return '';
    }
    return '';
}
