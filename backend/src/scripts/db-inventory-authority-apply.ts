import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type { ConnectionPool } from 'mssql';
import { closeSqlPool, getSqlPool, sql } from '../shared/database/sql-server.js';

/**
 * POWERPOS INVENTORY AUTHORITY PATCH — Apply Script
 *
 * Applies the inventory authority patches to the live SQL Server database:
 *   1. Creates sp_apply_utility_inventory_override and its performance index
 *      (executes backend/sql/inventory_override/101_patch_sp_update_stock_inventory.sql)
 *   2. Backs up existing procedure definitions to
 *      backend/backups/inventory-authority/YYYYMMDD-HHmmss/
 *   3. Dynamically patches each of the 5 legacy procedures to call
 *      sp_apply_utility_inventory_override at the end
 *   4. Executes SQL patch files 102–105 (idempotent; skip if already patched)
 *   5. Verifies patch markers exist
 *   6. Runs the authority simulation and verifies UTILITY-adjusted stock is preserved
 *
 * Modes:
 *   --dry-run    Show what would be done; connect to DB but apply nothing.
 *   --confirm    Required in non-dry-run mode to actually apply changes.
 *
 * Exit codes:
 *   0  All patches applied and verification passed
 *   1  Error, patch not applied, or verification failed
 */

// Scripts are always run from the backend/ directory via npm scripts.
const BACKEND_ROOT = process.cwd();

const PATCH_MARKER = 'POWERPOS INVENTORY AUTHORITY PATCH';
const SQL_DIR = path.join(BACKEND_ROOT, 'sql', 'inventory_override');
const BACKUP_BASE = path.join(BACKEND_ROOT, 'backups', 'inventory-authority');

// SQL files to execute in order.  File 101 creates sp_apply_utility_inventory_override
// and the performance index.  Files 102–105 patch the legacy procedures using dynamic SQL.
const SQL_PATCH_FILES = [
  '101_patch_sp_update_stock_inventory.sql',
  '102_patch_sp_update_stock_inventory_sku.sql',
  '103_patch_sp_update_assembly.sql',
  '104_patch_sp_update_stock_inventory2.sql',
  '105_patch_sp_update_stock_inventory_cloud.sql',
] as const;

// Legacy procedures to patch via TypeScript injection (backup + idempotent ALTER).
// File 101 creates sp_apply_utility_inventory_override itself, so it is not listed here.
const PROCEDURES_TO_PATCH = [
  'sp_update_stock_inventory',
  'sp_update_stock_inventory_sku',
  'sp_update_assembly',
  'sp_update_stock_inventory2',
  'sp_update_stock_inventory_cloud',
] as const;

const SIMULATION_PROCEDURE = 'sp_update_stock_inventory';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  let confirm = false;
  let dryRun = false;
  for (const arg of argv.slice(2)) {
    if (arg === '--confirm') confirm = true;
    else if (arg === '--dry-run') dryRun = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { confirm, dryRun };
}

function printSection(title: string) {
  console.log('');
  console.log('='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** Split a SQL file on GO batch separators and return non-empty batches. */
function splitSqlBatches(content: string): string[] {
  return content
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

/** Execute all batches in a SQL file, skipping empty ones. */
async function executeSqlFile(
  pool: ConnectionPool,
  filePath: string,
  dryRun: boolean
): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf8');
  const batches = splitSqlBatches(content);

  for (const batch of batches) {
    if (dryRun) {
      const preview = batch.slice(0, 120).replace(/\n/g, ' ');
      console.log(`    [DRY RUN] Would execute: ${preview}...`);
    } else {
      await pool.request().query(batch);
    }
  }
}

/**
 * Inject the POWERPOS INVENTORY AUTHORITY PATCH block immediately before the
 * last standalone "END" line of a stored procedure definition.
 *
 * Strategy:
 *  - Normalize CREATE PROCEDURE → CREATE OR ALTER PROCEDURE
 *  - Walk lines from the bottom; find the last line whose trimmed content is
 *    exactly "END" or "END;" (case-insensitive)
 *  - Insert the patch block before that line
 *  - If no standalone END is found, append the block (procedure has no wrapper)
 */
function injectPatch(definition: string, procedureName: string): string {
  if (definition.includes(PATCH_MARKER)) {
    return definition; // already patched
  }

  const patchLines = [
    '',
    `  -- ${PATCH_MARKER}: begin`,
    `  -- Procedure: ${procedureName}`,
    '  -- Restore authoritative UTILITY-adjusted stock after legacy recomputation.',
    "  IF OBJECT_ID(N'dbo.sp_apply_utility_inventory_override', N'P') IS NOT NULL",
    '  BEGIN',
    '    EXEC dbo.sp_apply_utility_inventory_override;',
    '  END;',
    `  -- ${PATCH_MARKER}: end`,
    '',
  ];

  // Normalize CREATE to CREATE OR ALTER.
  let patched = definition.replace(/\bCREATE\s+PROC(?:EDURE)?\b/i, 'CREATE OR ALTER PROCEDURE');

  const lines = patched.split('\n');
  let lastEndIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim().toUpperCase();
    if (t === 'END' || t === 'END;') {
      lastEndIdx = i;
      break;
    }
  }

  if (lastEndIdx >= 0) {
    lines.splice(lastEndIdx, 0, ...patchLines);
  } else {
    // No standalone END found — procedure body has no wrapper.
    // Append the patch with a surrounding BEGIN/END.
    lines.push('', 'BEGIN');
    lines.push(...patchLines);
    lines.push('END');
  }

  return lines.join('\n');
}

/**
 * Back up a procedure's current definition to a .sql file in the backup dir.
 * Returns the file path written (or null on dry run).
 */
function backupProcedure(
  backupDir: string,
  procedureName: string,
  definition: string,
  dryRun: boolean
): string {
  const filePath = path.join(backupDir, `${procedureName}.sql`);
  if (!dryRun) {
    fs.writeFileSync(
      filePath,
      `-- Backup of dbo.${procedureName} — ${new Date().toISOString()}\n-- Run this SQL to restore the original procedure.\n\n` +
        definition.replace(/\bCREATE\s+PROC(?:EDURE)?\b/i, 'CREATE OR ALTER PROCEDURE'),
      'utf8'
    );
  }
  return filePath;
}

/**
 * Read a procedure definition from sys.sql_modules.
 * Returns null if the procedure does not exist.
 */
async function readProcedureDefinition(
  pool: ConnectionPool,
  procedureName: string
): Promise<string | null> {
  const result = await pool
    .request()
    .input('procName', sql.NVarChar, procedureName)
    .query(`
      SELECT sm.definition
      FROM sys.sql_modules sm
      INNER JOIN sys.objects o ON o.object_id = sm.object_id
      INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
      WHERE o.name  = @procName
        AND s.name  = N'dbo'
        AND o.type  = N'P'
    `);

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  return row ? String(row.definition ?? '') : null;
}

/**
 * Patch one legacy procedure:
 *   1. Read its definition
 *   2. Back it up
 *   3. Inject the patch and ALTER the procedure
 */
async function patchProcedure(
  pool: ConnectionPool,
  procedureName: string,
  backupDir: string,
  dryRun: boolean
): Promise<{ skipped: boolean; reason: string }> {
  const definition = await readProcedureDefinition(pool, procedureName);

  if (definition === null) {
    return { skipped: true, reason: 'procedure not found in dbo schema' };
  }

  if (definition.includes(PATCH_MARKER)) {
    return { skipped: true, reason: 'already contains patch marker' };
  }

  // Backup BEFORE any modification.
  const backupPath = backupProcedure(backupDir, procedureName, definition, dryRun);
  if (!dryRun) {
    console.log(`    Backed up to: ${backupPath}`);
  }

  const patched = injectPatch(definition, procedureName);

  if (dryRun) {
    console.log(
      `    [DRY RUN] Would ALTER PROCEDURE ${procedureName} (${patched.length} chars)`
    );
    return { skipped: false, reason: 'dry run — not applied' };
  }

  await pool.request().query(patched);
  return { skipped: false, reason: 'patched successfully' };
}

// ──────────────────────────────────────────────────────────────────────────────
// Verification (inline authority check — always rolls back)
// ──────────────────────────────────────────────────────────────────────────────

interface VerifyItem {
  itemcode: string;
  authEndQty: number;
  afterEndQty: number;
  afterEndQtyTemp: number;
  afterAssemblyQty: number;
}

async function runVerification(pool: ConnectionPool): Promise<{
  passed: boolean;
  overwrittenItems: VerifyItem[];
  procedureExists: boolean;
}> {
  const existsResult = await pool
    .request()
    .input('procName', sql.NVarChar, SIMULATION_PROCEDURE)
    .query(
      `SELECT CASE WHEN OBJECT_ID(N'dbo.' + @procName, N'P') IS NOT NULL THEN 1 ELSE 0 END AS e`
    );

  const procedureExists =
    Number((existsResult.recordset[0] as Record<string, unknown>).e) === 1;

  if (!procedureExists) {
    return { passed: true, overwrittenItems: [], procedureExists: false };
  }

  const transaction = pool.transaction();
  await transaction.begin();

  try {
    // Capture authoritative values from inventory_adjustment (latest UTILITY row per item).
    const authResult = await transaction.request().query(`
      SELECT
        i.itemcode,
        CONVERT(DECIMAL(18, 2), qa.auth_end_qty) AS authEndQty
      FROM dbo.items i
      INNER JOIN (
        SELECT
          itemcode,
          end_qty AS auth_end_qty,
          ROW_NUMBER() OVER (
            PARTITION BY itemcode
            ORDER BY trans_date DESC
          ) AS rn
        FROM dbo.inventory_adjustment
        WHERE machine_id = 'UTILITY'
          AND ISNULL(CONVERT(INT, posted), 0) = 1
      ) qa ON qa.itemcode = i.itemcode AND qa.rn = 1
    `);

    if (authResult.recordset.length === 0) {
      // No UTILITY-adjusted items; nothing to verify.
      return { passed: true, overwrittenItems: [], procedureExists };
    }

    const authMap = new Map<string, number>();
    for (const row of authResult.recordset as Array<Record<string, unknown>>) {
      authMap.set(String(row.itemcode ?? ''), Number(row.authEndQty ?? 0));
    }

    // Run the legacy procedure.
    await transaction.request().query(`EXEC dbo.${SIMULATION_PROCEDURE}`);

    // Capture AFTER state.
    const afterResult = await transaction.request().query(`
      SELECT
        i.itemcode,
        ISNULL(CONVERT(DECIMAL(18, 2), i.end_qty),      0) AS afterEndQty,
        ISNULL(CONVERT(DECIMAL(18, 2), i.END_QTY_TEMP), 0) AS afterEndQtyTemp,
        ISNULL(CONVERT(DECIMAL(18, 2), i.ASSEMBLY_QTY), 0) AS afterAssemblyQty
      FROM dbo.items i
      WHERE EXISTS (
        SELECT 1
        FROM dbo.inventory_adjustment ia
        WHERE ia.itemcode   = i.itemcode
          AND ia.machine_id = 'UTILITY'
          AND ISNULL(CONVERT(INT, ia.posted), 0) = 1
      )
    `);

    const TOLERANCE = 0.01;
    const overwrittenItems: VerifyItem[] = [];

    for (const row of afterResult.recordset as Array<Record<string, unknown>>) {
      const itemcode = String(row.itemcode ?? '');
      const authEndQty = authMap.get(itemcode);
      if (authEndQty === undefined) continue;

      const afterEndQty = Number(row.afterEndQty ?? 0);
      const afterEndQtyTemp = Number(row.afterEndQtyTemp ?? 0);
      const afterAssemblyQty = Number(row.afterAssemblyQty ?? 0);

      // Fail if any of the three primary stock fields deviate from authoritative.
      const overwritten =
        Math.abs(afterEndQty - authEndQty) > TOLERANCE ||
        Math.abs(afterEndQtyTemp - authEndQty) > TOLERANCE ||
        Math.abs(afterAssemblyQty - authEndQty) > TOLERANCE;

      if (overwritten) {
        overwrittenItems.push({ itemcode, authEndQty, afterEndQty, afterEndQtyTemp, afterAssemblyQty });
      }
    }

    return { passed: overwrittenItems.length === 0, overwrittenItems, procedureExists };
  } finally {
    // ALWAYS rollback — verification must never persist changes.
    await transaction.rollback();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const { confirm, dryRun } = parseArgs(process.argv);

  if (!dryRun && !confirm) {
    console.error('');
    console.error('ERROR: Production apply mode requires --confirm flag.');
    console.error('');
    console.error('  To apply patches to the database:');
    console.error('    npm run db:inventory:authority-apply -- --confirm');
    console.error('');
    console.error('  To preview without applying:');
    console.error('    npm run db:inventory:authority-apply:dry');
    process.exit(1);
  }

  console.log('');
  console.log('POWERPOS INVENTORY AUTHORITY PATCH — Apply');
  console.log(dryRun ? 'Mode: DRY RUN (no changes written)' : 'Mode: LIVE APPLY (--confirm provided)');

  // ── Connect ──────────────────────────────────────────────────────────────────
  let pool: ConnectionPool;
  try {
    pool = await getSqlPool();
  } catch (err) {
    console.error('ERROR: Cannot connect to SQL Server:', err);
    process.exit(1);
  }

  const dbResult = await pool.request().query(`SELECT DB_NAME() AS dbName`);
  const dbName = String((dbResult.recordset[0] as Record<string, unknown>).dbName ?? '');
  console.log(`Database: ${dbName}`);

  // ── Backup directory ─────────────────────────────────────────────────────────
  const backupDir = path.join(BACKUP_BASE, timestamp());
  if (!dryRun) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Backup directory: ${backupDir}`);
  } else {
    console.log(`Backup directory (dry run): ${backupDir}`);
  }

  let failed = false;

  // ── STEP 1: Execute SQL patch files ──────────────────────────────────────────
  printSection('STEP 1: Execute SQL patch files (creates sp_apply_utility_inventory_override)');

  for (const filename of SQL_PATCH_FILES) {
    const filePath = path.join(SQL_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.log(`  [WARN] File not found, skipping: ${filePath}`);
      continue;
    }
    console.log(`  Executing: ${filename}`);
    try {
      await executeSqlFile(pool, filePath, dryRun);
      console.log(`  [OK] ${filename}`);
    } catch (err) {
      console.error(`  [FAIL] ${filename}:`, err instanceof Error ? err.message : err);
      failed = true;
    }
  }

  // ── STEP 2: TypeScript injection patch for each legacy procedure ──────────────
  printSection('STEP 2: Inject authority override into legacy procedures');

  for (const procedureName of PROCEDURES_TO_PATCH) {
    console.log(`  Patching: ${procedureName}`);
    try {
      const result = await patchProcedure(pool, procedureName, backupDir, dryRun);
      if (result.skipped) {
        console.log(`  [SKIP] ${procedureName}: ${result.reason}`);
      } else {
        console.log(`  [OK] ${procedureName}: ${result.reason}`);
      }
    } catch (err) {
      console.error(`  [FAIL] ${procedureName}:`, err instanceof Error ? err.message : err);
      failed = true;
    }
  }

  if (failed) {
    printSection('RESULT');
    console.log('FAIL — one or more patches could not be applied (see errors above).');
    await closeSqlPool();
    process.exit(1);
  }

  if (dryRun) {
    printSection('DRY RUN complete — no changes written');
    console.log('');
    console.log('To apply for real:');
    console.log('  npm run db:inventory:authority-apply -- --confirm');
    await closeSqlPool();
    process.exit(0);
  }

  // ── STEP 3: Verify patch markers ─────────────────────────────────────────────
  printSection('STEP 3: Verify patch markers');

  const markerCheckProcs = [
    'sp_apply_utility_inventory_override',
    ...PROCEDURES_TO_PATCH,
  ];

  let markersFailed = false;
  for (const procName of markerCheckProcs) {
    const markerResult = await pool
      .request()
      .input('procName', sql.NVarChar, procName)
      .input('marker', sql.NVarChar, PATCH_MARKER)
      .query(`
        SELECT
          CASE WHEN OBJECT_ID(N'dbo.' + @procName, N'P') IS NOT NULL THEN 1 ELSE 0 END AS e,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM sys.sql_modules sm
              WHERE sm.object_id = OBJECT_ID(N'dbo.' + @procName, N'P')
                AND sm.definition LIKE N'%' + @marker + N'%'
            ) THEN 1
            ELSE 0
          END AS patched
      `);

    const row = markerResult.recordset[0] as Record<string, unknown>;
    const exists = Number(row.e) === 1;
    const patched = Number(row.patched) === 1;

    if (!exists) {
      console.log(`  [SKIP] ${procName} — not found (may not be present on this system)`);
    } else if (!patched) {
      console.log(`  [FAIL] ${procName} — patch marker MISSING after apply`);
      markersFailed = true;
    } else {
      console.log(`  [PASS] ${procName} — patch marker confirmed`);
    }
  }

  // sp_apply_utility_inventory_override must exist.
  const overrideExistsResult = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.sp_apply_utility_inventory_override', N'P') IS NOT NULL THEN 1 ELSE 0 END AS e
  `);
  if (Number((overrideExistsResult.recordset[0] as Record<string, unknown>).e) !== 1) {
    console.log('  [FAIL] sp_apply_utility_inventory_override was NOT created.');
    markersFailed = true;
  }

  if (markersFailed) {
    printSection('RESULT');
    console.log('FAIL — patch markers missing after apply. Review errors above.');
    await closeSqlPool();
    process.exit(1);
  }

  // ── STEP 4: Run authority simulation ─────────────────────────────────────────
  printSection(`STEP 4: Authority simulation — EXEC ${SIMULATION_PROCEDURE} (rollback-safe)`);

  let verifyResult: Awaited<ReturnType<typeof runVerification>>;
  try {
    verifyResult = await runVerification(pool);
  } catch (err) {
    console.error('  ERROR during simulation:', err);
    await closeSqlPool();
    process.exit(1);
  }

  if (!verifyResult.procedureExists) {
    console.log(`  [SKIP] ${SIMULATION_PROCEDURE} not found — cannot run simulation.`);
  } else if (verifyResult.passed) {
    console.log(`  [PASS] ${SIMULATION_PROCEDURE} does NOT overwrite UTILITY-authoritative stock.`);
  } else {
    console.log(
      `  [FAIL] ${SIMULATION_PROCEDURE} still overwrites stock for ${verifyResult.overwrittenItems.length} item(s):`
    );
    for (const item of verifyResult.overwrittenItems) {
      console.log(
        `    ${item.itemcode}: auth=${item.authEndQty}  after_end_qty=${item.afterEndQty}` +
          `  after_END_QTY_TEMP=${item.afterEndQtyTemp}  after_ASSEMBLY_QTY=${item.afterAssemblyQty}`
      );
    }
    console.log('');
    console.log('  NOTE: All simulation changes were ROLLED BACK. No data was modified.');
    failed = true;
  }

  // ── Final result ─────────────────────────────────────────────────────────────
  printSection('RESULT');
  if (failed) {
    console.log('FAIL — verification did not pass. Review errors above.');
    console.log('');
    console.log('Rollback instructions:');
    console.log(`  Original procedure definitions backed up in: ${backupDir}`);
    console.log('  To restore a procedure: execute its .sql backup file in SSMS.');
    console.log('  To drop the override procedure:');
    console.log('    DROP PROCEDURE IF EXISTS dbo.sp_apply_utility_inventory_override;');
    console.log('  To drop the performance index:');
    console.log(
      '    DROP INDEX IF EXISTS IX_inventory_adjustment_utility_authority ON dbo.inventory_adjustment;'
    );
    await closeSqlPool();
    process.exit(1);
  }

  console.log('PASS — all patches applied and verified.');
  console.log('');
  console.log('Summary:');
  console.log(`  Database: ${dbName}`);
  console.log(`  Backups:  ${dryRun ? '(dry run)' : backupDir}`);
  console.log('  sp_apply_utility_inventory_override: created');
  console.log('  Legacy procedures patched with authority override call');
  console.log('  Simulation confirmed: UTILITY-adjusted stock is preserved');
  console.log('');
  console.log('Next steps:');
  console.log('  npm run db:inventory:authority-check   (confirm PASS)');
  console.log('  npm run test --prefix backend           (run integration tests)');

  await closeSqlPool();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  closeSqlPool().finally(() => process.exit(1));
});
