import type { ConnectionPool, Transaction } from 'mssql';
import { env } from '../config/env.js';
import { closeSqlPool, getSqlPool, sql } from '../shared/database/sql-server.js';

const TABLE_NAME = 'inventory_adjustment';
const OLD_BALANCE_COLUMN = 'old_balance';
const DEFAULT_OLD_BALANCE_TYPE = 'DECIMAL(18,4)';
const SOURCE_COLUMNS = ['qty', 'new_qty', 'end_qty', 'balance'] as const;
const TYPE_CANDIDATES = ['balance', 'new_qty', 'end_qty', 'qty'] as const;

type SqlExecutor = ConnectionPool | Transaction;

interface CliOptions {
  confirm: boolean;
  dryRun: boolean;
  help: boolean;
}

interface DatabaseInfo {
  databaseName: string;
  currentTimestamp: string;
}

interface TableInfo {
  schemaName: string;
  tableName: string;
}

interface ColumnInfo {
  columnName: string;
  dataType: string;
  maxLength: number;
  numericPrecision: number | null;
  numericScale: number | null;
  isNullable: boolean;
}

interface PreflightInfo {
  databaseInfo: DatabaseInfo;
  table: TableInfo;
  columns: Map<string, ColumnInfo>;
  totalRows: bigint;
  oldBalanceColumn: ColumnInfo | null;
  oldBalanceNullRows: bigint | null;
  oldBalanceType: string;
  oldBalanceTypeSource: string;
}

interface SampleRow {
  id?: unknown;
  trans_no?: unknown;
  qty: unknown;
  old_balance: unknown;
  balance: unknown;
  new_qty: unknown;
  end_qty: unknown;
}

let failedStep = 'startup';

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    confirm: false,
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--confirm') {
      options.confirm = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
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
  console.log('  npm run db:invadj:dry');
  console.log('  npm run db:invadj -- --confirm');
  console.log();
  console.log('Options:');
  console.log('  --dry-run   Inspect schema and print planned SQL without changing data.');
  console.log('  --confirm   Required when NODE_ENV=production and changes are requested.');
}

async function step<T>(label: string, work: () => Promise<T>): Promise<T> {
  failedStep = label;
  console.log();
  console.log(`[step] ${label}`);
  return work();
}

function quoteIdentifier(value: string): string {
  return `[${value.replaceAll(']', ']]')}]`;
}

function qualifiedTableName(table: TableInfo): string {
  return `${quoteIdentifier(table.schemaName)}.${quoteIdentifier(table.tableName)}`;
}

function normalizeName(value: string): string {
  return value.toLowerCase();
}

function getColumn(columns: Map<string, ColumnInfo>, columnName: string): ColumnInfo | null {
  return columns.get(normalizeName(columnName)) ?? null;
}

function requireColumn(columns: Map<string, ColumnInfo>, columnName: string): ColumnInfo {
  const column = getColumn(columns, columnName);

  if (!column) {
    throw new Error(`Required column ${columnName} is missing from ${TABLE_NAME}. No changes were made.`);
  }

  return column;
}

function columnSql(columns: Map<string, ColumnInfo>, columnName: string): string {
  return quoteIdentifier(requireColumn(columns, columnName).columnName);
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

function formatCount(value: bigint | null): string {
  return value == null ? 'N/A' : value.toString();
}

function formatValue(value: unknown): string {
  if (value == null) {
    return 'NULL';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function getRowsAffected(result: { rowsAffected?: number[] }): number {
  return result.rowsAffected?.reduce((total, count) => total + count, 0) ?? 0;
}

function isSupportedNumericType(column: ColumnInfo): boolean {
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
  ].includes(column.dataType.toLowerCase());
}

function buildColumnType(column: ColumnInfo): string | null {
  const dataType = column.dataType.toLowerCase();

  if ((dataType === 'decimal' || dataType === 'numeric') && column.numericPrecision != null) {
    const scale = column.numericScale ?? 0;
    return `${dataType.toUpperCase()}(${column.numericPrecision},${scale})`;
  }

  if (
    [
      'bigint',
      'float',
      'int',
      'money',
      'real',
      'smallint',
      'smallmoney',
      'tinyint',
    ].includes(dataType)
  ) {
    return dataType.toUpperCase();
  }

  return null;
}

function chooseOldBalanceType(columns: Map<string, ColumnInfo>): { sqlType: string; source: string } {
  for (const columnName of TYPE_CANDIDATES) {
    const column = getColumn(columns, columnName);

    if (!column || !isSupportedNumericType(column)) {
      continue;
    }

    const sqlType = buildColumnType(column);
    if (sqlType) {
      return {
        sqlType,
        source: column.columnName,
      };
    }
  }

  return {
    sqlType: DEFAULT_OLD_BALANCE_TYPE,
    source: 'default',
  };
}

function buildBackfillSql(table: TableInfo, columns: Map<string, ColumnInfo>): string {
  const tableName = qualifiedTableName(table);
  const oldBalance = columnSql(columns, OLD_BALANCE_COLUMN);
  const qty = columnSql(columns, 'qty');
  const newQty = columnSql(columns, 'new_qty');
  const endQty = columnSql(columns, 'end_qty');
  const balance = columnSql(columns, 'balance');

  return `
UPDATE ${tableName}
SET ${oldBalance} =
  CASE
    WHEN ${newQty} IS NOT NULL AND ${qty} IS NOT NULL THEN ${newQty} - ${qty}
    WHEN ${endQty} IS NOT NULL AND ${qty} IS NOT NULL THEN ${endQty} - ${qty}
    WHEN ${balance} IS NOT NULL THEN ${balance}
    ELSE 0
  END
WHERE ${oldBalance} IS NULL;
`.trim();
}

function printBackfillSql(table: TableInfo, columns: Map<string, ColumnInfo>): void {
  console.log(buildBackfillSql(table, columns));
}

function printNextSteps(): void {
  console.log();
  console.log('Next steps:');
  console.log('1. Deploy inventory adjustment app code.');
  console.log('2. Create one test adjustment.');
  console.log('3. Confirm:');
  console.log('   old_balance = previous stock');
  console.log('   balance = final stock');
  console.log('   new_qty = final stock');
  console.log('   end_qty = final stock');
}

async function getDatabaseInfo(executor: SqlExecutor): Promise<DatabaseInfo> {
  const result = await executor.request().query<DatabaseInfo>(`
    SELECT
      DB_NAME() AS databaseName,
      CONVERT(varchar(33), SYSDATETIMEOFFSET(), 126) AS currentTimestamp;
  `);

  const row = result.recordset[0];
  if (!row) {
    throw new Error('Could not read database name and timestamp.');
  }

  return row;
}

async function findInventoryAdjustmentTable(executor: SqlExecutor): Promise<TableInfo> {
  const result = await executor
    .request()
    .input('tableName', sql.NVarChar(128), TABLE_NAME)
    .query<TableInfo>(`
      SELECT
        s.name AS schemaName,
        t.name AS tableName
      FROM sys.tables t
      INNER JOIN sys.schemas s
        ON s.schema_id = t.schema_id
      WHERE t.name = @tableName
      ORDER BY s.name ASC;
    `);

  if (result.recordset.length === 0) {
    throw new Error(`${TABLE_NAME} table does not exist. No changes were made.`);
  }

  if (result.recordset.length > 1) {
    const schemas = result.recordset.map((row) => `${row.schemaName}.${row.tableName}`).join(', ');
    throw new Error(`Multiple ${TABLE_NAME} tables found (${schemas}). Refusing to choose one automatically.`);
  }

  return result.recordset[0];
}

async function getColumns(executor: SqlExecutor, table: TableInfo): Promise<Map<string, ColumnInfo>> {
  const result = await executor
    .request()
    .input('schemaName', sql.NVarChar(128), table.schemaName)
    .input('tableName', sql.NVarChar(128), table.tableName)
    .query<ColumnInfo>(`
      SELECT
        c.name AS columnName,
        ty.name AS dataType,
        c.max_length AS maxLength,
        CASE
          WHEN ty.name IN (N'decimal', N'numeric') THEN CONVERT(int, c.precision)
          ELSE NULL
        END AS numericPrecision,
        CASE
          WHEN ty.name IN (N'decimal', N'numeric') THEN CONVERT(int, c.scale)
          ELSE NULL
        END AS numericScale,
        CONVERT(bit, c.is_nullable) AS isNullable
      FROM sys.columns c
      INNER JOIN sys.tables t
        ON t.object_id = c.object_id
      INNER JOIN sys.schemas s
        ON s.schema_id = t.schema_id
      INNER JOIN sys.types ty
        ON ty.user_type_id = c.user_type_id
      WHERE s.name = @schemaName
        AND t.name = @tableName;
    `);

  return new Map(result.recordset.map((column) => [normalizeName(column.columnName), column]));
}

async function countRows(executor: SqlExecutor, table: TableInfo): Promise<bigint> {
  const result = await executor.request().query<{ totalRows: unknown }>(`
    SELECT COUNT_BIG(*) AS totalRows
    FROM ${qualifiedTableName(table)};
  `);

  return toBigIntCount(result.recordset[0]?.totalRows);
}

async function countOldBalanceNullRows(
  executor: SqlExecutor,
  table: TableInfo,
  columns: Map<string, ColumnInfo>
): Promise<bigint> {
  const oldBalance = columnSql(columns, OLD_BALANCE_COLUMN);
  const result = await executor.request().query<{ nullRows: unknown }>(`
    SELECT COUNT_BIG(*) AS nullRows
    FROM ${qualifiedTableName(table)}
    WHERE ${oldBalance} IS NULL;
  `);

  return toBigIntCount(result.recordset[0]?.nullRows);
}

async function getSampleRows(
  executor: SqlExecutor,
  table: TableInfo,
  columns: Map<string, ColumnInfo>
): Promise<SampleRow[]> {
  const idColumn = getColumn(columns, 'id');
  const transNoColumn = getColumn(columns, 'trans_no');
  const selectParts = [
    idColumn ? `${quoteIdentifier(idColumn.columnName)} AS id` : 'CAST(NULL AS nvarchar(50)) AS id',
    transNoColumn ? `${quoteIdentifier(transNoColumn.columnName)} AS trans_no` : 'CAST(NULL AS nvarchar(50)) AS trans_no',
    `${columnSql(columns, 'qty')} AS qty`,
    `${columnSql(columns, OLD_BALANCE_COLUMN)} AS old_balance`,
    `${columnSql(columns, 'balance')} AS balance`,
    `${columnSql(columns, 'new_qty')} AS new_qty`,
    `${columnSql(columns, 'end_qty')} AS end_qty`,
  ];
  const orderBy = idColumn
    ? `ORDER BY ${quoteIdentifier(idColumn.columnName)} ASC`
    : transNoColumn
      ? `ORDER BY ${quoteIdentifier(transNoColumn.columnName)} ASC`
      : '';

  const result = await executor.request().query<SampleRow>(`
    SELECT TOP (10)
      ${selectParts.join(',\n      ')}
    FROM ${qualifiedTableName(table)}
    ${orderBy};
  `);

  return result.recordset;
}

function validateRequiredColumns(columns: Map<string, ColumnInfo>): void {
  const missing = SOURCE_COLUMNS.filter((columnName) => !getColumn(columns, columnName));

  if (missing.length > 0) {
    throw new Error(`Required source columns are missing: ${missing.join(', ')}. No changes were made.`);
  }

  const nonNumeric = SOURCE_COLUMNS.filter((columnName) => {
    const column = getColumn(columns, columnName);
    return column ? !isSupportedNumericType(column) : false;
  });

  if (nonNumeric.length > 0) {
    throw new Error(`Required source columns are not numeric: ${nonNumeric.join(', ')}. No changes were made.`);
  }
}

async function inspectPreflight(pool: ConnectionPool): Promise<PreflightInfo> {
  const databaseInfo = await getDatabaseInfo(pool);
  const table = await findInventoryAdjustmentTable(pool);
  const columns = await getColumns(pool, table);

  validateRequiredColumns(columns);

  const totalRows = await countRows(pool, table);
  const oldBalanceColumn = getColumn(columns, OLD_BALANCE_COLUMN);
  const oldBalanceNullRows = oldBalanceColumn ? await countOldBalanceNullRows(pool, table, columns) : null;
  const chosenType = chooseOldBalanceType(columns);

  return {
    databaseInfo,
    table,
    columns,
    totalRows,
    oldBalanceColumn,
    oldBalanceNullRows,
    oldBalanceType: chosenType.sqlType,
    oldBalanceTypeSource: chosenType.source,
  };
}

function printPreflight(info: PreflightInfo): void {
  console.log('Preflight checks:');
  console.log(`  database name: ${info.databaseInfo.databaseName}`);
  console.log(`  current timestamp: ${info.databaseInfo.currentTimestamp}`);
  console.log(`  target table: ${qualifiedTableName(info.table)}`);
  console.log(`  total inventory_adjustment rows: ${formatCount(info.totalRows)}`);
  console.log(`  old_balance column exists: ${info.oldBalanceColumn ? 'yes' : 'no'}`);
  console.log(`  old_balance NULL rows: ${formatCount(info.oldBalanceNullRows)}`);
  console.log(`  old_balance column type for add: ${info.oldBalanceType} (source: ${info.oldBalanceTypeSource})`);
}

function printSampleRows(rows: SampleRow[]): void {
  console.log('Sample rows after backfill (up to 10):');

  if (rows.length === 0) {
    console.log('  No rows found.');
    return;
  }

  for (const row of rows) {
    console.log(
      [
        `  id=${formatValue(row.id)}`,
        `trans_no=${formatValue(row.trans_no)}`,
        `qty=${formatValue(row.qty)}`,
        `old_balance=${formatValue(row.old_balance)}`,
        `balance=${formatValue(row.balance)}`,
        `new_qty=${formatValue(row.new_qty)}`,
        `end_qty=${formatValue(row.end_qty)}`,
      ].join(' | ')
    );
  }
}

async function printDryRunPlan(pool: ConnectionPool, info: PreflightInfo): Promise<void> {
  const affectedRows = info.oldBalanceColumn ? info.oldBalanceNullRows ?? 0n : info.totalRows;
  const dryRunColumns = new Map(info.columns);

  if (!info.oldBalanceColumn) {
    dryRunColumns.set(normalizeName(OLD_BALANCE_COLUMN), {
      columnName: OLD_BALANCE_COLUMN,
      dataType: info.oldBalanceType.split('(')[0].toLowerCase(),
      maxLength: 0,
      numericPrecision: null,
      numericScale: null,
      isNullable: true,
    });
  }

  console.log('Dry run only. No changes will be made.');
  console.log(`Rows that would be backfilled: ${formatCount(affectedRows)}`);
  console.log('Planned actions:');

  if (!info.oldBalanceColumn) {
    console.log(`  1. Add old_balance: ALTER TABLE ${qualifiedTableName(info.table)} ADD [old_balance] ${info.oldBalanceType} NULL;`);
    console.log('  2. Backfill old_balance where it is NULL.');
  } else {
    console.log('  1. old_balance already exists. No ALTER TABLE ADD is needed.');
    console.log('  2. Backfill old_balance where it is NULL.');
  }

  console.log('  3. Verify old_balance has no NULL values.');
  console.log('  4. Print sample rows.');
  console.log('  5. Skip optional NOT NULL DEFAULT hardening for SQL Server safety.');
  console.log();
  console.log('SQL that would run:');

  if (!info.oldBalanceColumn) {
    console.log(`ALTER TABLE ${qualifiedTableName(info.table)} ADD [old_balance] ${info.oldBalanceType} NULL;`);
    console.log();
  }

  printBackfillSql(info.table, dryRunColumns);

  if (info.oldBalanceColumn) {
    const samples = await getSampleRows(pool, info.table, info.columns);
    console.log();
    console.log('Current sample rows (before dry-run changes):');
    printSampleRows(samples);
  } else {
    console.log();
    console.log('Sample rows are skipped because old_balance does not exist yet.');
  }

  console.log();
  console.log('Dry run completed. No changes were made.');
}

async function runMigration(pool: ConnectionPool, preflight: PreflightInfo): Promise<void> {
  const transaction = new sql.Transaction(pool);
  let transactionActive = false;

  try {
    await step('Begin transaction', async () => {
      await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      transactionActive = true;
      await transaction.request().query('SET XACT_ABORT ON;');
    });

    const table = await step('Re-check table and columns inside transaction', async () => {
      const currentTable = await findInventoryAdjustmentTable(transaction);
      const currentColumns = await getColumns(transaction, currentTable);
      validateRequiredColumns(currentColumns);
      return {
        table: currentTable,
        columns: currentColumns,
      };
    });

    let columns = table.columns;
    const oldBalanceColumn = getColumn(columns, OLD_BALANCE_COLUMN);

    if (!oldBalanceColumn) {
      await step('Add old_balance column', async () => {
        const sqlType = chooseOldBalanceType(columns).sqlType;
        const addColumnSql = `ALTER TABLE ${qualifiedTableName(table.table)} ADD [old_balance] ${sqlType} NULL;`;
        console.log(addColumnSql);
        await transaction.request().query(addColumnSql);
      });

      columns = await step('Refresh columns after ALTER TABLE', async () => getColumns(transaction, table.table));
    } else {
      console.log();
      console.log('[step] Add old_balance column');
      console.log('old_balance already exists. Skipping ALTER TABLE ADD.');
    }

    await step('Backfill old_balance where NULL', async () => {
      const backfillSql = buildBackfillSql(table.table, columns);
      console.log(backfillSql);
      const result = await transaction.request().query(backfillSql);
      console.log(`Rows backfilled: ${getRowsAffected(result)}`);
    });

    const verification = await step('Verify old_balance backfill', async () => {
      const totalRows = await countRows(transaction, table.table);
      const nullRows = await countOldBalanceNullRows(transaction, table.table, columns);
      const samples = await getSampleRows(transaction, table.table, columns);
      return { totalRows, nullRows, samples };
    });

    console.log(`Verification total rows: ${formatCount(verification.totalRows)}`);
    console.log(`Verification old_balance NULL rows: ${formatCount(verification.nullRows)}`);
    printSampleRows(verification.samples);

    if (verification.nullRows !== 0n) {
      throw new Error(`Verification failed: ${formatCount(verification.nullRows)} rows still have old_balance IS NULL.`);
    }

    await step('Optional hardening', async () => {
      const refreshedColumns = await getColumns(transaction, table.table);
      const refreshedOldBalance = getColumn(refreshedColumns, OLD_BALANCE_COLUMN);

      if (!refreshedOldBalance) {
        throw new Error('old_balance disappeared during migration. No commit will be attempted.');
      }

      if (!refreshedOldBalance.isNullable) {
        console.log('old_balance is already NOT NULL. No hardening change is needed.');
        return;
      }

      console.log('Skipping NOT NULL DEFAULT hardening for SQL Server production safety.');
      console.log('The app code must continue writing old_balance for new inventory adjustments.');
    });

    await step('Commit transaction', async () => {
      await transaction.commit();
      transactionActive = false;
    });

    console.log();
    console.log('Inventory adjustment DB preparation completed successfully.');
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

  console.log('Inventory adjustment DB preparation');
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'apply'}`);
  console.log(`NODE_ENV: ${env.NODE_ENV}`);

  if (env.NODE_ENV === 'production' && !options.dryRun && !options.confirm) {
    console.error('Production database detected. Re-run with --confirm after taking a backup.');
    process.exitCode = 1;
    return;
  }

  const pool = await step('Connect to database', async () => getSqlPool());
  const preflight = await step('Run preflight safety checks', async () => inspectPreflight(pool));

  printPreflight(preflight);

  if (options.dryRun) {
    await step('Build dry-run plan', async () => printDryRunPlan(pool, preflight));
    printNextSteps();
    return;
  }

  console.log();
  console.log('Make sure you have a fresh production backup before continuing.');

  await runMigration(pool, preflight);
  printNextSteps();
}

main()
  .catch((error: unknown) => {
    console.error();
    console.error('Inventory adjustment DB preparation failed.');
    console.error(`Failed step: ${failedStep}`);
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool().catch((error: unknown) => {
      console.error('Failed to close database connection:', error);
      process.exitCode = 1;
    });
  });
