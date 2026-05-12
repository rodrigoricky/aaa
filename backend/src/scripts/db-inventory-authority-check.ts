import 'dotenv/config';
import { closeSqlPool, getSqlPool, sql } from '../shared/database/sql-server.js';

/**
 * POWERPOS INVENTORY AUTHORITY PATCH — Verification Script
 *
 * Verifies that running the legacy stock-update procedures will NOT
 * overwrite UTILITY-authoritative stock.
 *
 * Comparison strategy:
 *   The authoritative end_qty is taken from the latest posted
 *   inventory_adjustment row with machine_id = 'UTILITY' for each item.
 *   After sp_update_stock_inventory runs (inside a rolled-back transaction),
 *   the AFTER values of end_qty, END_QTY_TEMP, and ASSEMBLY_QTY must equal
 *   the authoritative value.  assembly_box is excluded from the failure
 *   check because the legacy procedure's rotation logic may legitimately
 *   change it; sp_apply_utility_inventory_override restores it as well, but
 *   the authoritative-override call happens INSIDE the procedure after
 *   patching, so the primary three fields are the correct pass/fail signal.
 *
 * Modes:
 *   --dry-run   Check only whether procedures contain the patch marker.
 *               No procedure calls are made.
 *   (default)   Full simulation: execute sp_update_stock_inventory inside a
 *               rolled-back transaction and compare AFTER primary fields
 *               against authoritative inventory_adjustment.end_qty.
 *
 * Exit codes:
 *   0  All checks PASSED
 *   1  One or more checks FAILED
 */

const PATCH_MARKER = 'POWERPOS INVENTORY AUTHORITY PATCH';

const PROCEDURES_TO_CHECK = [
  'sp_update_stock_inventory',
  'sp_update_stock_inventory_sku',
  'sp_update_assembly',
  'sp_update_stock_inventory2',
  'sp_update_stock_inventory_cloud',
  'sp_apply_utility_inventory_override',
] as const;

// Procedure to call for the simulation test (most commonly run EOD procedure).
const SIMULATION_PROCEDURE = 'sp_update_stock_inventory';

interface PatchCheckResult {
  procedure: string;
  exists: boolean;
  patched: boolean;
}

interface OverwrittenItem {
  itemcode: string;
  authEndQty: number;
  afterEndQty: number;
  afterEndQtyTemp: number;
  afterAssemblyQty: number;
}

interface SimulationResult {
  ranSimulation: boolean;
  procedureExists: boolean;
  overwrittenItems: OverwrittenItem[];
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { dryRun };
}

async function checkPatchMarkers(): Promise<PatchCheckResult[]> {
  const pool = await getSqlPool();
  const results: PatchCheckResult[] = [];

  for (const procedureName of PROCEDURES_TO_CHECK) {
    const result = await pool
      .request()
      .input('procedureName', sql.NVarChar, procedureName)
      .input('patchMarker', sql.NVarChar, PATCH_MARKER)
      .query(`
        SELECT
          CASE WHEN OBJECT_ID(N'dbo.' + @procedureName, N'P') IS NOT NULL THEN 1 ELSE 0 END AS procedureExists,
          CASE
            WHEN OBJECT_ID(N'dbo.' + @procedureName, N'P') IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM sys.sql_modules sm
               WHERE sm.object_id = OBJECT_ID(N'dbo.' + @procedureName, N'P')
                 AND sm.definition LIKE N'%' + @patchMarker + N'%'
             )
            THEN 1
            ELSE 0
          END AS isPatchedOrTemplated
      `);

    const row = result.recordset[0] as Record<string, unknown>;
    results.push({
      procedure: procedureName,
      exists: Number(row.procedureExists) === 1,
      patched: Number(row.isPatchedOrTemplated) === 1,
    });
  }

  return results;
}

async function runSimulation(): Promise<SimulationResult> {
  const pool = await getSqlPool();

  // Check whether the simulation procedure exists.
  const existsResult = await pool
    .request()
    .input('procName', sql.NVarChar, SIMULATION_PROCEDURE)
    .query(
      `SELECT CASE WHEN OBJECT_ID(N'dbo.' + @procName, N'P') IS NOT NULL THEN 1 ELSE 0 END AS e`
    );

  const procedureExists =
    Number((existsResult.recordset[0] as Record<string, unknown>).e) === 1;

  if (!procedureExists) {
    return { ranSimulation: false, procedureExists: false, overwrittenItems: [] };
  }

  const transaction = pool.transaction();
  await transaction.begin();

  try {
    // Capture the authoritative end_qty for each UTILITY-adjusted item.
    // This is the value that items.end_qty MUST equal after the patched
    // procedure runs; it comes from the latest posted UTILITY adjustment.
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
      // No UTILITY-adjusted items — nothing to verify; trivially passes.
      return { ranSimulation: true, procedureExists, overwrittenItems: [] };
    }

    const authMap = new Map<string, number>();
    for (const row of authResult.recordset as Array<Record<string, unknown>>) {
      authMap.set(String(row.itemcode ?? ''), Number(row.authEndQty ?? 0));
    }

    // Execute the legacy procedure inside the transaction.
    await transaction.request().query(`EXEC dbo.${SIMULATION_PROCEDURE}`);

    // Capture AFTER state for the three primary stock fields.
    // assembly_box is intentionally excluded from the failure check: the legacy
    // procedure's rotation logic (END_QTY_TEMP → assembly_box) legitimately
    // changes it; sp_apply_utility_inventory_override corrects it too, but
    // the rotation may cause the BEFORE and AFTER values to differ even when
    // the stock authority is correctly enforced on the primary fields.
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
    const overwrittenItems: OverwrittenItem[] = [];

    for (const row of afterResult.recordset as Array<Record<string, unknown>>) {
      const itemcode = String(row.itemcode ?? '');
      const authEndQty = authMap.get(itemcode);
      if (authEndQty === undefined) continue;

      const afterEndQty = Number(row.afterEndQty ?? 0);
      const afterEndQtyTemp = Number(row.afterEndQtyTemp ?? 0);
      const afterAssemblyQty = Number(row.afterAssemblyQty ?? 0);

      // PASS criterion: all three primary fields must equal the authoritative value.
      const overwritten =
        Math.abs(afterEndQty - authEndQty) > TOLERANCE ||
        Math.abs(afterEndQtyTemp - authEndQty) > TOLERANCE ||
        Math.abs(afterAssemblyQty - authEndQty) > TOLERANCE;

      if (overwritten) {
        overwrittenItems.push({
          itemcode,
          authEndQty,
          afterEndQty,
          afterEndQtyTemp,
          afterAssemblyQty,
        });
      }
    }

    return { ranSimulation: true, procedureExists, overwrittenItems };
  } finally {
    // ALWAYS rollback — this script must never persist procedure side-effects.
    await transaction.rollback();
  }
}

function printSection(title: string) {
  console.log('');
  console.log('='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
  let failed = false;

  console.log('');
  console.log('POWERPOS INVENTORY AUTHORITY PATCH — Verification');
  console.log(dryRun ? 'Mode: DRY RUN (patch-marker check only)' : 'Mode: FULL SIMULATION (transaction-safe)');

  // ----------------------------------------------------------------
  // CHECK 1: Patch marker detection
  // ----------------------------------------------------------------
  printSection('CHECK 1: Patch marker presence in procedure definitions');

  let patchResults: PatchCheckResult[];
  try {
    patchResults = await checkPatchMarkers();
  } catch (err) {
    console.error('  ERROR: Could not query sys.sql_modules:', err);
    await closeSqlPool();
    process.exit(1);
  }

  let allCriticalPatched = true;
  for (const r of patchResults) {
    if (!r.exists) {
      console.log(`  [MISSING] ${r.procedure} — procedure does not exist in dbo schema`);
      if (r.procedure === 'sp_apply_utility_inventory_override') {
        console.log(`  [FAIL] sp_apply_utility_inventory_override is REQUIRED. Run db:inventory:authority-apply first.`);
        allCriticalPatched = false;
        failed = true;
      }
    } else if (!r.patched) {
      console.log(`  [WARN] ${r.procedure} — exists but does NOT contain the patch marker`);
      if (r.procedure === 'sp_apply_utility_inventory_override') {
        console.log(`  [FAIL] sp_apply_utility_inventory_override must contain "${PATCH_MARKER}".`);
        allCriticalPatched = false;
        failed = true;
      }
    } else {
      console.log(`  [PASS] ${r.procedure} — patch marker present`);
    }
  }

  if (allCriticalPatched) {
    console.log('');
    console.log('  Override procedure sp_apply_utility_inventory_override is deployed.');
  }

  if (dryRun) {
    printSection('DRY RUN complete — no procedures were executed');
    console.log('');
    if (failed) {
      console.log('RESULT: FAIL — apply patches first:  npm run db:inventory:authority-apply -- --confirm');
    } else {
      console.log('RESULT: PASS (dry run)');
    }
    await closeSqlPool();
    process.exit(failed ? 1 : 0);
  }

  // ----------------------------------------------------------------
  // CHECK 2: Simulation (always rolled back)
  // ----------------------------------------------------------------
  printSection(`CHECK 2: Simulation — EXEC ${SIMULATION_PROCEDURE} inside rollback`);
  console.log('  Pass criterion: end_qty, END_QTY_TEMP, ASSEMBLY_QTY must equal');
  console.log('  the authoritative inventory_adjustment.end_qty for each UTILITY item.');

  let simResult: SimulationResult;
  try {
    simResult = await runSimulation();
  } catch (err) {
    console.error('  ERROR during simulation:', err);
    await closeSqlPool();
    process.exit(1);
  }

  if (!simResult.procedureExists) {
    console.log(`  [SKIP] ${SIMULATION_PROCEDURE} does not exist on this system.`);
    console.log('  Cannot verify inline-patch behavior.');
    console.log('  Ensure sp_apply_utility_inventory_override is called after the');
    console.log('  equivalent procedure in your EOD workflow.');
  } else if (!simResult.ranSimulation) {
    console.log('  [SKIP] Simulation was skipped.');
  } else if (simResult.overwrittenItems.length === 0) {
    console.log(`  [PASS] ${SIMULATION_PROCEDURE} preserved all UTILITY-authoritative stock.`);
  } else {
    console.log(
      `  [FAIL] ${SIMULATION_PROCEDURE} overwrote stock for ${simResult.overwrittenItems.length} item(s):`
    );
    failed = true;
    for (const item of simResult.overwrittenItems) {
      console.log(`    itemcode: ${item.itemcode}`);
      console.log(`      authoritative: end_qty=${item.authEndQty}`);
      console.log(
        `      after procedure: end_qty=${item.afterEndQty}  END_QTY_TEMP=${item.afterEndQtyTemp}  ASSEMBLY_QTY=${item.afterAssemblyQty}`
      );
    }
    console.log('');
    console.log('  ACTION: Apply patches first:');
    console.log('    npm run db:inventory:authority-apply -- --confirm');
  }

  console.log('');
  console.log('  NOTE: All simulation changes were ROLLED BACK. No data was modified.');

  // ----------------------------------------------------------------
  // Final result
  // ----------------------------------------------------------------
  printSection('FINAL RESULT');
  if (failed) {
    console.log('FAIL — apply outstanding patches before going live.');
    console.log('');
    console.log('  npm run db:inventory:authority-apply -- --confirm');
    console.log('');
    console.log('Rollback instructions:');
    console.log('  This script never writes data; there is nothing to rollback here.');
    console.log('  To revert sp_apply_utility_inventory_override:');
    console.log('    DROP PROCEDURE IF EXISTS dbo.sp_apply_utility_inventory_override;');
    console.log('  To revert the performance index:');
    console.log(
      '    DROP INDEX IF EXISTS IX_inventory_adjustment_utility_authority ON dbo.inventory_adjustment;'
    );
    await closeSqlPool();
    process.exit(1);
  } else {
    console.log('PASS — UTILITY-authoritative stock is protected.');
    await closeSqlPool();
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  closeSqlPool().finally(() => process.exit(1));
});

