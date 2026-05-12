import type { ConnectionPool, Transaction } from 'mssql';
import { env } from '../config/env.js';
import { closeSqlPool, getSqlPool, sql } from '../shared/database/sql-server.js';

interface CliOptions {
  dryRun: boolean;
  confirm: boolean;
  help: boolean;
}

interface ColumnInfo {
  schemaName: string;
  tableName: string;
  columnName: string;
  dataType: string;
  maxLength: number;
  numericPrecision: number | null;
  numericScale: number | null;
  isNullable: boolean;
}

interface TableRef {
  schemaName: string;
  tableName: string;
}

type SqlExecutor = ConnectionPool | Transaction;

const requiredSchema: Record<string, string[]> = {
  items: ['itemcode', 'beg_qty', 'end_qty', 'END_QTY_TEMP', 'ASSEMBLY_QTY', 'assembly_box'],
  delivery: ['itemcode', 'qty', 'qty2', 'posted'],
  sales: ['itemcode', 'qty', 'posted'],
  pullout: ['itemcode', 'qty', 'posted'],
  inventory_adjustment: ['itemcode', 'qty', 'balance', 'new_qty', 'end_qty', 'posted', 'old_balance'],
};

const targetOldBalanceTable: TableRef = {
  schemaName: 'dbo',
  tableName: 'inventory_adjustment',
};

const oldBalanceColumnName = 'old_balance';
const oldBalanceDefaultType = 'DECIMAL(18,4)';
let failedStep = 'startup';

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    confirm: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--confirm') {
      options.confirm = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage(): void {
  console.log('Usage:');
  console.log('  npm run db:invadj:merge:dry');
  console.log('  npm run db:invadj:merge -- --confirm');
  console.log();
  console.log('Options:');
  console.log('  --dry-run   Inspect schema and print actions without changing data.');
  console.log('  --confirm   Required when NODE_ENV=production and applying changes.');
}

async function step<T>(label: string, work: () => Promise<T>): Promise<T> {
  failedStep = label;
  console.log();
  console.log(`[step] ${label}`);
  return work();
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function quoteIdentifier(value: string): string {
  return `[${value.replaceAll(']', ']]')}]`;
}

function fullTableName(table: TableRef): string {
  return `${quoteIdentifier(table.schemaName)}.${quoteIdentifier(table.tableName)}`;
}

function toBigIntCount(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    return BigInt(value);
  }

  if (typeof value === 'string') {
    return BigInt(value);
  }

  throw new Error(`Unexpected count value: ${String(value)}`);
}

function formatCount(value: bigint): string {
  return value.toString();
}

function isNumericType(typeName: string): boolean {
  return [
    'bigint',
    'decimal',
    'float',
    'int',
    'money',
    'numeric',
    'real',
    'smallint',
    'smallmoney',
    'tinyint',
  ].includes(typeName.toLowerCase());
}

function getTypeSql(column: ColumnInfo): string {
  const dataType = column.dataType.toLowerCase();

  if ((dataType === 'decimal' || dataType === 'numeric') && column.numericPrecision != null) {
    return `${dataType.toUpperCase()}(${column.numericPrecision},${column.numericScale ?? 0})`;
  }

  if ([
    'bigint',
    'float',
    'int',
    'money',
    'real',
    'smallint',
    'smallmoney',
    'tinyint',
  ].includes(dataType)) {
    return dataType.toUpperCase();
  }

  return oldBalanceDefaultType;
}

function getColumn(
  columnsByTable: Map<string, Map<string, ColumnInfo>>,
  tableName: string,
  columnName: string
): ColumnInfo | null {
  return columnsByTable.get(normalize(tableName))?.get(normalize(columnName)) ?? null;
}

function chooseOldBalanceType(columnsByTable: Map<string, Map<string, ColumnInfo>>): string {
  const candidates = ['balance', 'new_qty', 'end_qty', 'qty'];

  for (const candidate of candidates) {
    const column = getColumn(columnsByTable, 'inventory_adjustment', candidate);
    if (!column || !isNumericType(column.dataType)) {
      continue;
    }

    return getTypeSql(column);
  }

  return oldBalanceDefaultType;
}

async function fetchDbName(executor: SqlExecutor): Promise<string> {
  const result = await executor.request().query<{ dbName: string }>(`SELECT DB_NAME() AS dbName;`);
  return result.recordset[0]?.dbName ?? '(unknown)';
}

async function fetchTables(executor: SqlExecutor): Promise<Set<string>> {
  const result = await executor.request().query<{ schemaName: string; tableName: string }>(`
    SELECT s.name AS schemaName, t.name AS tableName
    FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id;
  `);

  return new Set(result.recordset.map((row) => normalize(`${row.schemaName}.${row.tableName}`)));
}

async function fetchColumns(executor: SqlExecutor): Promise<Map<string, Map<string, ColumnInfo>>> {
  const result = await executor.request().query<ColumnInfo>(`
    SELECT
      s.name AS schemaName,
      t.name AS tableName,
      c.name AS columnName,
      ty.name AS dataType,
      c.max_length AS maxLength,
      CASE WHEN ty.name IN (N'decimal', N'numeric') THEN CONVERT(int, c.precision) ELSE NULL END AS numericPrecision,
      CASE WHEN ty.name IN (N'decimal', N'numeric') THEN CONVERT(int, c.scale) ELSE NULL END AS numericScale,
      CONVERT(bit, c.is_nullable) AS isNullable
    FROM sys.columns c
    INNER JOIN sys.tables t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    INNER JOIN sys.types ty ON ty.user_type_id = c.user_type_id;
  `);

  const tableMap = new Map<string, Map<string, ColumnInfo>>();

  for (const row of result.recordset) {
    const tableKey = normalize(row.tableName);
    if (!tableMap.has(tableKey)) {
      tableMap.set(tableKey, new Map());
    }

    tableMap.get(tableKey)?.set(normalize(row.columnName), row);
  }

  return tableMap;
}

function verifyRequiredTables(tableSet: Set<string>): string[] {
  const missing: string[] = [];

  for (const tableName of Object.keys(requiredSchema)) {
    const qualified = normalize(`dbo.${tableName}`);
    if (!tableSet.has(qualified)) {
      missing.push(`dbo.${tableName}`);
    }
  }

  return missing;
}

function verifyRequiredColumns(columnsByTable: Map<string, Map<string, ColumnInfo>>): string[] {
  const missing: string[] = [];

  for (const [tableName, columns] of Object.entries(requiredSchema)) {
    for (const column of columns) {
      const exists = columnsByTable.get(normalize(tableName))?.has(normalize(column)) ?? false;
      if (!exists) {
        missing.push(`dbo.${tableName}.${column}`);
      }
    }
  }

  return missing;
}

async function existsUpdateStockProcedure(executor: SqlExecutor): Promise<boolean> {
  const result = await executor.request().query<{ objectId: number | null }>(`
    SELECT OBJECT_ID(N'dbo.sp_update_stock_inventory', N'P') AS objectId;
  `);

  return result.recordset[0]?.objectId != null;
}

async function querySingleCount(executor: SqlExecutor, query: string): Promise<bigint> {
  const result = await executor.request().query<{ value: unknown }>(query);
  return toBigIntCount(result.recordset[0]?.value);
}

async function gatherDiagnostics(executor: SqlExecutor): Promise<Record<string, bigint>> {
  const [
    totalItems,
    totalDelivery,
    totalSales,
    totalPullout,
    totalInvAdj,
    invAdjOldBalanceNull,
    deliveryQtyMismatch,
    itemMirrorMismatch,
  ] = await Promise.all([
    querySingleCount(executor, `SELECT COUNT_BIG(*) AS value FROM [dbo].[items];`),
    querySingleCount(executor, `SELECT COUNT_BIG(*) AS value FROM [dbo].[delivery];`),
    querySingleCount(executor, `SELECT COUNT_BIG(*) AS value FROM [dbo].[sales];`),
    querySingleCount(executor, `SELECT COUNT_BIG(*) AS value FROM [dbo].[pullout];`),
    querySingleCount(executor, `SELECT COUNT_BIG(*) AS value FROM [dbo].[inventory_adjustment];`),
    querySingleCount(
      executor,
      `SELECT COUNT_BIG(*) AS value FROM [dbo].[inventory_adjustment] WHERE [old_balance] IS NULL;`
    ),
    querySingleCount(
      executor,
      `
      SELECT COUNT_BIG(*) AS value
      FROM [dbo].[delivery]
      WHERE ISNULL(CONVERT(decimal(38, 10), [qty]), 0) <> ISNULL(CONVERT(decimal(38, 10), [qty2]), 0);
      `
    ),
    querySingleCount(
      executor,
      `
      SELECT COUNT_BIG(*) AS value
      FROM [dbo].[items]
      WHERE NOT (
        ISNULL(CONVERT(decimal(38, 10), [end_qty]), 0) = ISNULL(CONVERT(decimal(38, 10), [END_QTY_TEMP]), 0)
        AND ISNULL(CONVERT(decimal(38, 10), [end_qty]), 0) = ISNULL(CONVERT(decimal(38, 10), [ASSEMBLY_QTY]), 0)
        AND ISNULL(CONVERT(decimal(38, 10), [end_qty]), 0) = ISNULL(CONVERT(decimal(38, 10), [assembly_box]), 0)
      );
      `
    ),
  ]);

  return {
    totalItems,
    totalDelivery,
    totalSales,
    totalPullout,
    totalInvAdj,
    invAdjOldBalanceNull,
    deliveryQtyMismatch,
    itemMirrorMismatch,
  };
}

function printDiagnostics(diag: Record<string, bigint>): void {
  console.log('Diagnostics:');
  console.log(`  total items: ${formatCount(diag.totalItems)}`);
  console.log(`  total delivery rows: ${formatCount(diag.totalDelivery)}`);
  console.log(`  total sales rows: ${formatCount(diag.totalSales)}`);
  console.log(`  total pullout rows: ${formatCount(diag.totalPullout)}`);
  console.log(`  total inventory_adjustment rows: ${formatCount(diag.totalInvAdj)}`);
  console.log(`  inventory_adjustment old_balance NULL rows: ${formatCount(diag.invAdjOldBalanceNull)}`);
  console.log(`  delivery rows where qty != qty2: ${formatCount(diag.deliveryQtyMismatch)}`);
  console.log(`  items mirror mismatch count: ${formatCount(diag.itemMirrorMismatch)}`);
}

async function oldBalanceNullCount(executor: SqlExecutor): Promise<bigint> {
  return querySingleCount(
    executor,
    `SELECT COUNT_BIG(*) AS value FROM [dbo].[inventory_adjustment] WHERE [old_balance] IS NULL;`
  );
}

function buildBackfillSql(): string {
  return `
UPDATE [dbo].[inventory_adjustment]
SET [old_balance] =
  CASE
    WHEN [new_qty] IS NOT NULL AND [qty] IS NOT NULL THEN [new_qty] - [qty]
    WHEN [end_qty] IS NOT NULL AND [qty] IS NOT NULL THEN [end_qty] - [qty]
    WHEN [balance] IS NOT NULL THEN [balance]
    ELSE 0
  END
WHERE [old_balance] IS NULL;
`.trim();
}

async function hasOldBalanceDefaultConstraint(executor: SqlExecutor): Promise<boolean> {
  const result = await executor.request().query<{ hasDefault: number }>(`
    SELECT CASE WHEN EXISTS (
      SELECT 1
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
      INNER JOIN sys.tables t
        ON t.object_id = c.object_id
      INNER JOIN sys.schemas s
        ON s.schema_id = t.schema_id
      WHERE s.name = N'dbo'
        AND t.name = N'inventory_adjustment'
        AND c.name = N'old_balance'
    ) THEN 1 ELSE 0 END AS hasDefault;
  `);

  return result.recordset[0]?.hasDefault === 1;
}

function pickDefaultConstraintName(): string {
  return 'DF_inventory_adjustment_old_balance';
}

async function runApply(pool: ConnectionPool): Promise<void> {
  const transaction = new sql.Transaction(pool);
  let transactionActive = false;

  try {
    await step('Begin transaction', async () => {
      await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      transactionActive = true;
      await transaction.request().query('SET XACT_ABORT ON;');
    });

    const columnsBefore = await step('Refresh schema inside transaction', async () => fetchColumns(transaction));
    const oldBalanceColumn = getColumn(columnsBefore, 'inventory_adjustment', oldBalanceColumnName);

    if (!oldBalanceColumn) {
      await step('Add dbo.inventory_adjustment.old_balance as nullable', async () => {
        const typeSql = chooseOldBalanceType(columnsBefore);
        const addSql = `ALTER TABLE ${fullTableName(targetOldBalanceTable)} ADD [old_balance] ${typeSql} NULL;`;
        console.log(addSql);
        await transaction.request().query(addSql);
      });
    } else {
      console.log();
      console.log('[step] Add dbo.inventory_adjustment.old_balance as nullable');
      console.log('Action skipped: column already exists.');
    }

    await step('Backfill dbo.inventory_adjustment.old_balance where NULL', async () => {
      const backfillSql = buildBackfillSql();
      console.log(backfillSql);
      const result = await transaction.request().query(backfillSql);
      const rowsAffected = result.rowsAffected?.reduce((sum, value) => sum + value, 0) ?? 0;
      console.log(`Rows backfilled: ${rowsAffected}`);
    });

    await step('Optional hardening to NOT NULL DEFAULT 0 (only if safe)', async () => {
      const columnsAfterBackfill = await fetchColumns(transaction);
      const oldBalance = getColumn(columnsAfterBackfill, 'inventory_adjustment', oldBalanceColumnName);

      if (!oldBalance) {
        throw new Error('old_balance column is missing after add/backfill.');
      }

      const remainingNull = await oldBalanceNullCount(transaction);
      if (remainingNull !== 0n) {
        throw new Error(`Cannot harden old_balance: ${remainingNull.toString()} NULL rows remain.`);
      }

      if (!oldBalance.isNullable) {
        console.log('Action skipped: old_balance already NOT NULL.');
        return;
      }

      const hasDefault = await hasOldBalanceDefaultConstraint(transaction);
      if (!hasDefault) {
        const addDefaultSql = `ALTER TABLE ${fullTableName(targetOldBalanceTable)} ADD CONSTRAINT ${quoteIdentifier(
          pickDefaultConstraintName()
        )} DEFAULT (0) FOR [old_balance];`;
        console.log(addDefaultSql);
        await transaction.request().query(addDefaultSql);
      } else {
        console.log('Action skipped: DEFAULT constraint already exists for old_balance.');
      }

      const typeSql = getTypeSql(oldBalance);
      const alterSql = `ALTER TABLE ${fullTableName(targetOldBalanceTable)} ALTER COLUMN [old_balance] ${typeSql} NOT NULL;`;
      console.log(alterSql);
      await transaction.request().query(alterSql);
    });

    await step('Commit transaction', async () => {
      await transaction.commit();
      transactionActive = false;
    });
  } catch (error) {
    if (transactionActive) {
      console.error();
      console.error('Rolling back transaction...');
      await transaction.rollback().catch((rollbackError: unknown) => {
        console.error('Rollback failed:', rollbackError);
      });
    }

    throw error;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  console.log('Inventory adjustment SQL Server merge/prep');
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'apply'}`);
  console.log(`NODE_ENV: ${env.NODE_ENV}`);

  if (env.NODE_ENV === 'production' && !options.dryRun && !options.confirm) {
    console.error('Production mode detected. Re-run with --confirm after taking a backup.');
    process.exitCode = 1;
    return;
  }

  const pool = await step('Connect to SQL Server', async () => getSqlPool());
  const databaseName = await step('Read connected database name', async () => fetchDbName(pool));
  console.log(`Connected DB: ${databaseName}`);

  const [tables, columnsByTable] = await step('Preflight schema inspection', async () =>
    Promise.all([fetchTables(pool), fetchColumns(pool)])
  );

  const missingTables = verifyRequiredTables(tables);
  const missingColumns = verifyRequiredColumns(columnsByTable);

  if (missingTables.length > 0 || missingColumns.length > 0) {
    console.log('Preflight result: FAILED');
    if (missingTables.length > 0) {
      console.log('Missing required tables:');
      for (const missing of missingTables) {
        console.log(`  - ${missing}`);
      }
    }

    if (missingColumns.length > 0) {
      console.log('Missing required columns:');
      for (const missing of missingColumns) {
        console.log(`  - ${missing}`);
      }
    }

    throw new Error('Schema preflight failed. No changes were made.');
  }

  console.log('Preflight result: PASSED');

  const procExists = await step('Check dbo.sp_update_stock_inventory existence', async () =>
    existsUpdateStockProcedure(pool)
  );

  if (procExists) {
    console.log('Found: dbo.sp_update_stock_inventory');
    console.log('Warning: old POS may execute dbo.sp_update_stock_inventory during loading.');
  } else {
    console.log('Not found: dbo.sp_update_stock_inventory');
  }

  const beforeDiag = await step('Collect pre-apply diagnostics', async () => gatherDiagnostics(pool));
  printDiagnostics(beforeDiag);

  const oldBalanceExists = getColumn(columnsByTable, 'inventory_adjustment', oldBalanceColumnName) != null;
  const oldBalanceType = chooseOldBalanceType(columnsByTable);

  if (options.dryRun) {
    console.log();
    console.log('Actions that would be taken:');
    if (!oldBalanceExists) {
      console.log(
        `  - Add column ${fullTableName(targetOldBalanceTable)}.[old_balance] ${oldBalanceType} NULL`
      );
    } else {
      console.log('  - Skip add column: old_balance already exists');
    }

    console.log('  - Backfill old_balance for rows where old_balance IS NULL');
    console.log('  - If safe: add DEFAULT(0) and set old_balance NOT NULL');
    console.log('  - No global stock recalculation or historical row rewrite');
    console.log('  - Do NOT execute dbo.sp_update_stock_inventory');
    console.log();
    console.log('Dry-run complete. No changes were made.');
    return;
  }

  console.log();
  console.log('Backup warning: ensure you have a recent database backup before apply mode.');

  await runApply(pool);

  const afterDiag = await step('Collect post-apply diagnostics', async () => gatherDiagnostics(pool));
  console.log();
  console.log('Verification result:');
  printDiagnostics(afterDiag);

  console.log();
  console.log('Inventory adjustment SQL Server merge/prep completed safely.');
  console.log('- No stock quantities were globally overwritten.');
  console.log('- Historical sales/delivery/pullout records were not modified.');
  console.log('- old_balance is ready.');
  console.log('- Backend compatibility logic can now be deployed.');
  console.log('- Test one item before full use.');

  console.log();
  console.log('Next steps:');
  console.log('1. Deploy backend compatibility code.');
  console.log('2. Run one controlled quantity adjustment and verify values in inventory_adjustment.');
  console.log('3. Validate legacy POS and new app stock agree for that item.');
}

main()
  .catch((error: unknown) => {
    console.error();
    console.error('Inventory adjustment SQL Server merge/prep failed.');
    console.error(`Failed step: ${failedStep}`);
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool().catch((error: unknown) => {
      console.error('Failed to close SQL Server connection:', error);
      process.exitCode = 1;
    });
  });
