import type { ConnectionPool, Transaction } from 'mssql';
import { env } from '../config/env.js';
import { getSqlConfig, sql } from '../shared/database/sql-server.js';

const SNAPSHOT_SCHEMA = 'demo_snapshot';
const DEMO_LOCK_RESOURCE = 'gnp-pos-demo-mode';
const DEMO_REQUEST_TIMEOUT_MS = 600_000;
const CONTROL_TABLES = [
  'demo_mode_state',
  'demo_snapshot_tables',
  'demo_snapshot_constraints',
  'demo_snapshot_triggers',
];

type SqlExecutor = ConnectionPool | Transaction;

interface DemoStateRow {
  id: number;
  snapshotId: string;
  databaseName: string;
  startedAt: Date;
}

interface AppTableRow {
  schemaName: string;
  tableName: string;
  hasIdentity: boolean;
  identityColumn: string | null;
  identitySeedValue: string | number | null;
  identityIncrementValue: string | number | null;
  identityLastValue: string | number | null;
}

interface SnapshotTableRow extends AppTableRow {
  tableOrdinal: number;
  snapshotSchema: string;
  snapshotTable: string;
  rowCount: number;
}

interface ConstraintStateRow {
  schemaName: string;
  tableName: string;
  constraintName: string;
  isDisabled: boolean;
  isNotTrusted: boolean;
}

interface TriggerStateRow {
  schemaName: string;
  tableName: string;
  triggerName: string;
  isDisabled: boolean;
}

function quoteIdentifier(value: string) {
  return `[${value.replaceAll(']', ']]')}]`;
}

function qualifiedName(schemaName: string, tableName: string) {
  return `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
}

function sqlString(value: string) {
  return `N'${value.replaceAll("'", "''")}'`;
}

function formatIdentityValue(value: string | number | null) {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  if (!/^-?\d+$/.test(text)) {
    throw new Error(`Invalid identity metadata value: ${text}`);
  }

  return text;
}

function subtractIdentityValues(left: string | number | null, right: string | number | null) {
  const leftValue = formatIdentityValue(left);
  const rightValue = formatIdentityValue(right);
  if (leftValue == null || rightValue == null) {
    return null;
  }

  return String(BigInt(leftValue) - BigInt(rightValue));
}

function createSnapshotId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `S${stamp}_${suffix}`;
}

function createDemoPool() {
  const config = getSqlConfig();

  return new sql.ConnectionPool({
    ...config,
    requestTimeout: DEMO_REQUEST_TIMEOUT_MS,
    pool: {
      ...config.pool,
      min: 0,
      max: 1,
    },
  });
}

async function getDatabaseName(executor: SqlExecutor) {
  const result = await executor.request().query('SELECT DB_NAME() AS databaseName');
  return String(result.recordset[0]?.databaseName ?? env.SQLSERVER_DATABASE);
}

export async function ensureDemoControlTables(pool: ConnectionPool) {
  const utilitySchema = quoteIdentifier(env.UTILITY_SCHEMA);
  const snapshotSchema = quoteIdentifier(SNAPSHOT_SCHEMA);

  await pool.request().batch(`
    IF SCHEMA_ID(${sqlString(env.UTILITY_SCHEMA)}) IS NULL
    BEGIN
      EXEC(N'CREATE SCHEMA ${utilitySchema}');
    END

    IF SCHEMA_ID(${sqlString(SNAPSHOT_SCHEMA)}) IS NULL
    BEGIN
      EXEC(N'CREATE SCHEMA ${snapshotSchema}');
    END

    IF OBJECT_ID(N'${utilitySchema}.[demo_mode_state]', N'U') IS NULL
    BEGIN
      CREATE TABLE ${utilitySchema}.[demo_mode_state] (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        is_active BIT NOT NULL DEFAULT 0,
        snapshot_id NVARCHAR(80) NOT NULL,
        database_name NVARCHAR(128) NOT NULL,
        started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        started_by NVARCHAR(100) NOT NULL DEFAULT N'system',
        ended_at DATETIME2 NULL,
        notes NVARCHAR(MAX) NULL
      );

      CREATE UNIQUE INDEX UX_demo_mode_state_active
        ON ${utilitySchema}.[demo_mode_state] (is_active)
        WHERE is_active = 1;
    END

    IF OBJECT_ID(N'${utilitySchema}.[demo_snapshot_tables]', N'U') IS NULL
    BEGIN
      CREATE TABLE ${utilitySchema}.[demo_snapshot_tables] (
        snapshot_id NVARCHAR(80) NOT NULL,
        table_ordinal INT NOT NULL,
        original_schema NVARCHAR(128) NOT NULL,
        original_table NVARCHAR(128) NOT NULL,
        snapshot_schema NVARCHAR(128) NOT NULL,
        snapshot_table NVARCHAR(128) NOT NULL,
        has_identity BIT NOT NULL DEFAULT 0,
        identity_column NVARCHAR(128) NULL,
        identity_seed_value DECIMAL(38, 0) NULL,
        identity_increment_value DECIMAL(38, 0) NULL,
        identity_last_value DECIMAL(38, 0) NULL,
        row_count BIGINT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_demo_snapshot_tables PRIMARY KEY (snapshot_id, table_ordinal)
      );
    END

    IF OBJECT_ID(N'${utilitySchema}.[demo_snapshot_constraints]', N'U') IS NULL
    BEGIN
      CREATE TABLE ${utilitySchema}.[demo_snapshot_constraints] (
        snapshot_id NVARCHAR(80) NOT NULL,
        original_schema NVARCHAR(128) NOT NULL,
        original_table NVARCHAR(128) NOT NULL,
        constraint_name NVARCHAR(128) NOT NULL,
        constraint_type NVARCHAR(30) NOT NULL,
        is_disabled BIT NOT NULL,
        is_not_trusted BIT NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_demo_snapshot_constraints
          PRIMARY KEY (snapshot_id, original_schema, original_table, constraint_name)
      );
    END

    IF OBJECT_ID(N'${utilitySchema}.[demo_snapshot_triggers]', N'U') IS NULL
    BEGIN
      CREATE TABLE ${utilitySchema}.[demo_snapshot_triggers] (
        snapshot_id NVARCHAR(80) NOT NULL,
        original_schema NVARCHAR(128) NOT NULL,
        original_table NVARCHAR(128) NOT NULL,
        trigger_name NVARCHAR(128) NOT NULL,
        is_disabled BIT NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_demo_snapshot_triggers
          PRIMARY KEY (snapshot_id, original_schema, original_table, trigger_name)
      );
    END
  `);
}

async function acquireDemoModeLock(transaction: Transaction) {
  const result = await transaction.request().query(`
    DECLARE @lockResult INT;

    EXEC @lockResult = sp_getapplock
      @Resource = ${sqlString(DEMO_LOCK_RESOURCE)},
      @LockMode = N'Exclusive',
      @LockOwner = N'Transaction',
      @LockTimeout = 0;

    SELECT @lockResult AS lockResult;
  `);

  const lockResult = Number(result.recordset[0]?.lockResult ?? -999);
  if (lockResult < 0) {
    throw new Error('Another demo mode operation is already running.');
  }
}

async function getActiveDemoState(executor: SqlExecutor, lock = false) {
  const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
  const result = await executor.request().query(`
    SELECT TOP 1
      id,
      snapshot_id AS snapshotId,
      database_name AS databaseName,
      started_at AS startedAt
    FROM ${qualifiedName(env.UTILITY_SCHEMA, 'demo_mode_state')} ${lockHint}
    WHERE is_active = 1
    ORDER BY started_at DESC, id DESC
  `);

  return (result.recordset[0] as DemoStateRow | undefined) ?? null;
}

async function getApplicationTables(executor: SqlExecutor) {
  const controlNames = CONTROL_TABLES.map((table) => sqlString(table)).join(', ');
  const result = await executor
    .request()
    .input('utilitySchema', sql.NVarChar, env.UTILITY_SCHEMA)
    .input('snapshotSchema', sql.NVarChar, SNAPSHOT_SCHEMA)
    .query(`
      SELECT
        s.name AS schemaName,
        t.name AS tableName,
        CASE WHEN ic.name IS NULL THEN CAST(0 AS BIT) ELSE CAST(1 AS BIT) END AS hasIdentity,
        ic.name AS identityColumn,
        CONVERT(DECIMAL(38, 0), ic.seed_value) AS identitySeedValue,
        CONVERT(DECIMAL(38, 0), ic.increment_value) AS identityIncrementValue,
        CONVERT(DECIMAL(38, 0), ic.last_value) AS identityLastValue
      FROM sys.tables t
      INNER JOIN sys.schemas s
        ON s.schema_id = t.schema_id
      LEFT JOIN sys.identity_columns ic
        ON ic.object_id = t.object_id
      WHERE t.is_ms_shipped = 0
        AND s.name <> @snapshotSchema
        AND NOT (
          s.name = @utilitySchema
          AND t.name IN (${controlNames})
        )
      ORDER BY s.name ASC, t.name ASC
    `);

  return result.recordset.map((row: Record<string, unknown>) => ({
    schemaName: String(row.schemaName),
    tableName: String(row.tableName),
    hasIdentity: Boolean(row.hasIdentity),
    identityColumn: row.identityColumn == null ? null : String(row.identityColumn),
    identitySeedValue: row.identitySeedValue as string | number | null,
    identityIncrementValue: row.identityIncrementValue as string | number | null,
    identityLastValue: row.identityLastValue as string | number | null,
  })) satisfies AppTableRow[];
}

async function getSnapshotTables(executor: SqlExecutor, snapshotId: string) {
  const result = await executor
    .request()
    .input('snapshotId', sql.NVarChar, snapshotId)
    .query(`
      SELECT
        table_ordinal AS tableOrdinal,
        original_schema AS schemaName,
        original_table AS tableName,
        snapshot_schema AS snapshotSchema,
        snapshot_table AS snapshotTable,
        has_identity AS hasIdentity,
        identity_column AS identityColumn,
        identity_seed_value AS identitySeedValue,
        identity_increment_value AS identityIncrementValue,
        identity_last_value AS identityLastValue,
        row_count AS [rowCount]
      FROM ${qualifiedName(env.UTILITY_SCHEMA, 'demo_snapshot_tables')}
      WHERE snapshot_id = @snapshotId
      ORDER BY table_ordinal ASC
    `);

  return result.recordset.map((row: Record<string, unknown>) => ({
    tableOrdinal: Number(row.tableOrdinal),
    schemaName: String(row.schemaName),
    tableName: String(row.tableName),
    snapshotSchema: String(row.snapshotSchema),
    snapshotTable: String(row.snapshotTable),
    hasIdentity: Boolean(row.hasIdentity),
    identityColumn: row.identityColumn == null ? null : String(row.identityColumn),
    identitySeedValue: row.identitySeedValue as string | number | null,
    identityIncrementValue: row.identityIncrementValue as string | number | null,
    identityLastValue: row.identityLastValue as string | number | null,
    rowCount: Number(row.rowCount ?? 0),
  })) satisfies SnapshotTableRow[];
}

async function getInsertableColumns(
  executor: SqlExecutor,
  schemaName: string,
  tableName: string
) {
  const result = await executor
    .request()
    .input('schemaName', sql.NVarChar, schemaName)
    .input('tableName', sql.NVarChar, tableName)
    .query(`
      SELECT c.name AS columnName
      FROM sys.columns c
      INNER JOIN sys.tables t
        ON t.object_id = c.object_id
      INNER JOIN sys.schemas s
        ON s.schema_id = t.schema_id
      WHERE s.name = @schemaName
        AND t.name = @tableName
        AND c.is_computed = 0
        AND c.system_type_id <> 189
      ORDER BY c.column_id ASC
    `);

  return result.recordset.map((row: Record<string, unknown>) => String(row.columnName));
}

async function getSnapshotConstraints(executor: SqlExecutor, snapshotId: string) {
  const result = await executor
    .request()
    .input('snapshotId', sql.NVarChar, snapshotId)
    .query(`
      SELECT
        original_schema AS schemaName,
        original_table AS tableName,
        constraint_name AS constraintName,
        is_disabled AS isDisabled,
        is_not_trusted AS isNotTrusted
      FROM ${qualifiedName(env.UTILITY_SCHEMA, 'demo_snapshot_constraints')}
      WHERE snapshot_id = @snapshotId
      ORDER BY original_schema ASC, original_table ASC, constraint_name ASC
    `);

  return result.recordset.map((row: Record<string, unknown>) => ({
    schemaName: String(row.schemaName),
    tableName: String(row.tableName),
    constraintName: String(row.constraintName),
    isDisabled: Boolean(row.isDisabled),
    isNotTrusted: Boolean(row.isNotTrusted),
  })) satisfies ConstraintStateRow[];
}

async function getSnapshotTriggers(executor: SqlExecutor, snapshotId: string) {
  const result = await executor
    .request()
    .input('snapshotId', sql.NVarChar, snapshotId)
    .query(`
      SELECT
        original_schema AS schemaName,
        original_table AS tableName,
        trigger_name AS triggerName,
        is_disabled AS isDisabled
      FROM ${qualifiedName(env.UTILITY_SCHEMA, 'demo_snapshot_triggers')}
      WHERE snapshot_id = @snapshotId
      ORDER BY original_schema ASC, original_table ASC, trigger_name ASC
    `);

  return result.recordset.map((row: Record<string, unknown>) => ({
    schemaName: String(row.schemaName),
    tableName: String(row.tableName),
    triggerName: String(row.triggerName),
    isDisabled: Boolean(row.isDisabled),
  })) satisfies TriggerStateRow[];
}

async function countRows(executor: SqlExecutor, schemaName: string, tableName: string) {
  const result = await executor.request().query(`
    SELECT COUNT_BIG(*) AS [rowCount]
    FROM ${qualifiedName(schemaName, tableName)}
  `);

  return Number(result.recordset[0]?.rowCount ?? 0);
}

async function captureConstraintStates(
  transaction: Transaction,
  snapshotId: string,
  table: AppTableRow
) {
  await transaction
    .request()
    .input('snapshotId', sql.NVarChar, snapshotId)
    .input('schemaName', sql.NVarChar, table.schemaName)
    .input('tableName', sql.NVarChar, table.tableName)
    .query(`
      INSERT INTO ${qualifiedName(env.UTILITY_SCHEMA, 'demo_snapshot_constraints')} (
        snapshot_id,
        original_schema,
        original_table,
        constraint_name,
        constraint_type,
        is_disabled,
        is_not_trusted
      )
      SELECT
        @snapshotId,
        @schemaName,
        @tableName,
        fk.name,
        N'FOREIGN_KEY',
        fk.is_disabled,
        fk.is_not_trusted
      FROM sys.foreign_keys fk
      INNER JOIN sys.tables t
        ON t.object_id = fk.parent_object_id
      INNER JOIN sys.schemas s
        ON s.schema_id = t.schema_id
      WHERE s.name = @schemaName
        AND t.name = @tableName
      UNION ALL
      SELECT
        @snapshotId,
        @schemaName,
        @tableName,
        cc.name,
        N'CHECK',
        cc.is_disabled,
        cc.is_not_trusted
      FROM sys.check_constraints cc
      INNER JOIN sys.tables t
        ON t.object_id = cc.parent_object_id
      INNER JOIN sys.schemas s
        ON s.schema_id = t.schema_id
      WHERE s.name = @schemaName
        AND t.name = @tableName
    `);
}

async function captureTriggerStates(
  transaction: Transaction,
  snapshotId: string,
  table: AppTableRow
) {
  await transaction
    .request()
    .input('snapshotId', sql.NVarChar, snapshotId)
    .input('schemaName', sql.NVarChar, table.schemaName)
    .input('tableName', sql.NVarChar, table.tableName)
    .query(`
      INSERT INTO ${qualifiedName(env.UTILITY_SCHEMA, 'demo_snapshot_triggers')} (
        snapshot_id,
        original_schema,
        original_table,
        trigger_name,
        is_disabled
      )
      SELECT
        @snapshotId,
        @schemaName,
        @tableName,
        tr.name,
        tr.is_disabled
      FROM sys.triggers tr
      INNER JOIN sys.tables t
        ON t.object_id = tr.parent_id
      INNER JOIN sys.schemas s
        ON s.schema_id = t.schema_id
      WHERE s.name = @schemaName
        AND t.name = @tableName
        AND tr.parent_class = 1
    `);
}

async function insertSnapshotTableMetadata(
  transaction: Transaction,
  snapshotId: string,
  ordinal: number,
  table: AppTableRow,
  snapshotTable: string,
  rowCount: number
) {
  await transaction
    .request()
    .input('snapshotId', sql.NVarChar, snapshotId)
    .input('tableOrdinal', sql.Int, ordinal)
    .input('originalSchema', sql.NVarChar, table.schemaName)
    .input('originalTable', sql.NVarChar, table.tableName)
    .input('snapshotSchema', sql.NVarChar, SNAPSHOT_SCHEMA)
    .input('snapshotTable', sql.NVarChar, snapshotTable)
    .input('hasIdentity', sql.Bit, table.hasIdentity)
    .input('identityColumn', sql.NVarChar, table.identityColumn)
    .input('identitySeedValue', sql.Decimal(38, 0), table.identitySeedValue)
    .input('identityIncrementValue', sql.Decimal(38, 0), table.identityIncrementValue)
    .input('identityLastValue', sql.Decimal(38, 0), table.identityLastValue)
    .input('rowCount', sql.BigInt, rowCount)
    .query(`
      INSERT INTO ${qualifiedName(env.UTILITY_SCHEMA, 'demo_snapshot_tables')} (
        snapshot_id,
        table_ordinal,
        original_schema,
        original_table,
        snapshot_schema,
        snapshot_table,
        has_identity,
        identity_column,
        identity_seed_value,
        identity_increment_value,
        identity_last_value,
        row_count
      )
      VALUES (
        @snapshotId,
        @tableOrdinal,
        @originalSchema,
        @originalTable,
        @snapshotSchema,
        @snapshotTable,
        @hasIdentity,
        @identityColumn,
        @identitySeedValue,
        @identityIncrementValue,
        @identityLastValue,
        @rowCount
      )
    `);
}

async function beginDemoTransaction(
  pool: ConnectionPool,
  isolationLevel = sql.ISOLATION_LEVEL.READ_COMMITTED
) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(isolationLevel);

  try {
    await transaction.request().batch('SET XACT_ABORT ON;');
    await acquireDemoModeLock(transaction);
  } catch (error) {
    await rollbackQuietly(transaction);
    throw error;
  }

  return transaction;
}

async function rollbackQuietly(transaction: Transaction) {
  try {
    await transaction.rollback();
  } catch {
    // Best effort: the original error is more useful to the operator.
  }
}

export async function enableDemoMode() {
  const pool = createDemoPool();

  try {
    await pool.connect();
    await ensureDemoControlTables(pool);

    const databaseName = await getDatabaseName(pool);
    console.log(`Connected database: ${databaseName}`);

    const activeState = await getActiveDemoState(pool);
    if (activeState) {
      console.log(`Demo mode is already active with snapshot ${activeState.snapshotId}.`);
      console.log('Existing snapshot was not overwritten.');
      return;
    }

    const tables = await getApplicationTables(pool);
    if (tables.length === 0) {
      throw new Error('No application tables were found to snapshot.');
    }

    const snapshotId = createSnapshotId();
    const transaction = await beginDemoTransaction(pool);

    try {
      const activeStateInTransaction = await getActiveDemoState(transaction, true);
      if (activeStateInTransaction) {
        await transaction.commit();
        console.log(`Demo mode is already active with snapshot ${activeStateInTransaction.snapshotId}.`);
        console.log('Existing snapshot was not overwritten.');
        return;
      }

      for (const [index, table] of tables.entries()) {
        const ordinal = index + 1;
        const snapshotTable = `${snapshotId}__${String(ordinal).padStart(4, '0')}`;

        await captureConstraintStates(transaction, snapshotId, table);
        await captureTriggerStates(transaction, snapshotId, table);

        await transaction.request().batch(`
          SELECT *
          INTO ${qualifiedName(SNAPSHOT_SCHEMA, snapshotTable)}
          FROM ${qualifiedName(table.schemaName, table.tableName)}
        `);

        const rowCount = await countRows(transaction, SNAPSHOT_SCHEMA, snapshotTable);
        await insertSnapshotTableMetadata(
          transaction,
          snapshotId,
          ordinal,
          table,
          snapshotTable,
          rowCount
        );
      }

      await transaction
        .request()
        .input('snapshotId', sql.NVarChar, snapshotId)
        .input('databaseName', sql.NVarChar, databaseName)
        .input('startedBy', sql.NVarChar, 'system')
        .input('notes', sql.NVarChar(sql.MAX), 'Demo mode snapshot captured')
        .query(`
          INSERT INTO ${qualifiedName(env.UTILITY_SCHEMA, 'demo_mode_state')} (
            is_active,
            snapshot_id,
            database_name,
            started_by,
            notes
          )
          VALUES (1, @snapshotId, @databaseName, @startedBy, @notes)
        `);

      await transaction.commit();

      console.log(`Snapshot ID: ${snapshotId}`);
      console.log(`Tables snapshotted: ${tables.length}`);
      for (const table of tables) {
        console.log(`  - ${table.schemaName}.${table.tableName}`);
      }
      console.log('Demo mode is now active.');
    } catch (error) {
      await rollbackQuietly(transaction);
      throw error;
    }
  } finally {
    await pool.close();
  }
}

async function disableTableGuards(transaction: Transaction, tables: SnapshotTableRow[]) {
  for (const table of tables) {
    await transaction.request().batch(`
      DISABLE TRIGGER ALL ON ${qualifiedName(table.schemaName, table.tableName)};
      ALTER TABLE ${qualifiedName(table.schemaName, table.tableName)} NOCHECK CONSTRAINT ALL;
    `);
  }
}

async function deleteCurrentRows(transaction: Transaction, tables: SnapshotTableRow[]) {
  for (const table of [...tables].reverse()) {
    await transaction.request().batch(`
      DELETE FROM ${qualifiedName(table.schemaName, table.tableName)};
    `);
  }
}

async function restoreRows(transaction: Transaction, tables: SnapshotTableRow[]) {
  for (const table of tables) {
    const columns = await getInsertableColumns(transaction, table.schemaName, table.tableName);
    if (columns.length === 0) {
      continue;
    }

    const columnList = columns.map(quoteIdentifier).join(', ');
    const target = qualifiedName(table.schemaName, table.tableName);
    const source = qualifiedName(table.snapshotSchema, table.snapshotTable);
    const identityOn = table.hasIdentity ? `SET IDENTITY_INSERT ${target} ON;` : '';
    const identityOff = table.hasIdentity ? `SET IDENTITY_INSERT ${target} OFF;` : '';

    await transaction.request().batch(`
      ${identityOn}
      INSERT INTO ${target} (${columnList})
      SELECT ${columnList}
      FROM ${source};
      ${identityOff}
    `);
  }
}

async function restoreIdentitySeeds(transaction: Transaction, tables: SnapshotTableRow[]) {
  for (const table of tables) {
    if (!table.hasIdentity) {
      continue;
    }

    const reseedValue =
      formatIdentityValue(table.identityLastValue) ??
      subtractIdentityValues(table.identitySeedValue, table.identityIncrementValue);

    if (reseedValue == null) {
      continue;
    }

    await transaction.request().batch(`
      DBCC CHECKIDENT (${sqlString(qualifiedName(table.schemaName, table.tableName))}, RESEED, ${reseedValue}) WITH NO_INFOMSGS;
    `);
  }
}

async function restoreConstraintStates(
  transaction: Transaction,
  snapshotId: string,
  tables: SnapshotTableRow[]
) {
  const constraints = await getSnapshotConstraints(transaction, snapshotId);
  const tableKeys = new Set(tables.map((table) => `${table.schemaName}.${table.tableName}`));

  for (const constraint of constraints) {
    if (!tableKeys.has(`${constraint.schemaName}.${constraint.tableName}`)) {
      continue;
    }

    if (constraint.isDisabled) {
      continue;
    }

    const trustClause = constraint.isNotTrusted ? '' : 'WITH CHECK';
    await transaction.request().batch(`
      ALTER TABLE ${qualifiedName(constraint.schemaName, constraint.tableName)}
      ${trustClause} CHECK CONSTRAINT ${quoteIdentifier(constraint.constraintName)};
    `);
  }
}

async function restoreTriggerStates(
  transaction: Transaction,
  snapshotId: string,
  tables: SnapshotTableRow[]
) {
  const triggers = await getSnapshotTriggers(transaction, snapshotId);
  const tableKeys = new Set(tables.map((table) => `${table.schemaName}.${table.tableName}`));

  for (const trigger of triggers) {
    if (!tableKeys.has(`${trigger.schemaName}.${trigger.tableName}`)) {
      continue;
    }

    if (trigger.isDisabled) {
      continue;
    }

    await transaction.request().batch(`
      ENABLE TRIGGER ${quoteIdentifier(trigger.triggerName)}
      ON ${qualifiedName(trigger.schemaName, trigger.tableName)};
    `);
  }
}

async function dropSnapshotTables(transaction: Transaction, tables: SnapshotTableRow[]) {
  for (const table of [...tables].reverse()) {
    await transaction.request().batch(`
      IF OBJECT_ID(${sqlString(qualifiedName(table.snapshotSchema, table.snapshotTable))}, N'U') IS NOT NULL
      BEGIN
        DROP TABLE ${qualifiedName(table.snapshotSchema, table.snapshotTable)};
      END
    `);
  }
}

async function archiveDemoState(
  transaction: Transaction,
  stateId: number,
  snapshotId: string
) {
  await transaction
    .request()
    .input('stateId', sql.BigInt, stateId)
    .input('snapshotId', sql.NVarChar, snapshotId)
    .query(`
      DELETE FROM ${qualifiedName(env.UTILITY_SCHEMA, 'demo_snapshot_triggers')}
      WHERE snapshot_id = @snapshotId;

      DELETE FROM ${qualifiedName(env.UTILITY_SCHEMA, 'demo_snapshot_constraints')}
      WHERE snapshot_id = @snapshotId;

      DELETE FROM ${qualifiedName(env.UTILITY_SCHEMA, 'demo_snapshot_tables')}
      WHERE snapshot_id = @snapshotId;

      UPDATE ${qualifiedName(env.UTILITY_SCHEMA, 'demo_mode_state')}
      SET
        is_active = 0,
        ended_at = SYSUTCDATETIME(),
        notes = N'Demo mode restored and snapshot tables removed'
      WHERE id = @stateId
        AND snapshot_id = @snapshotId
        AND is_active = 1;
    `);
}

export async function disableDemoMode() {
  const pool = createDemoPool();

  try {
    await pool.connect();
    await ensureDemoControlTables(pool);

    const databaseName = await getDatabaseName(pool);
    console.log(`Connected database: ${databaseName}`);
    console.log('WARNING: restoring the database to the active demo snapshot.');

    const activeState = await getActiveDemoState(pool);
    if (!activeState) {
      console.log('Demo mode is not active. No data was changed.');
      return;
    }

    console.log(`Snapshot ID being restored: ${activeState.snapshotId}`);

    const transaction = await beginDemoTransaction(pool, sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const lockedState = await getActiveDemoState(transaction, true);
      if (!lockedState || lockedState.snapshotId !== activeState.snapshotId) {
        await transaction.commit();
        console.log('Demo mode is not active. No data was changed.');
        return;
      }

      const tables = await getSnapshotTables(transaction, lockedState.snapshotId);
      if (tables.length === 0) {
        throw new Error(`Active snapshot ${lockedState.snapshotId} has no table metadata.`);
      }

      await disableTableGuards(transaction, tables);
      await deleteCurrentRows(transaction, tables);
      await restoreRows(transaction, tables);
      await restoreIdentitySeeds(transaction, tables);
      await restoreConstraintStates(transaction, lockedState.snapshotId, tables);
      await restoreTriggerStates(transaction, lockedState.snapshotId, tables);
      await dropSnapshotTables(transaction, tables);
      await archiveDemoState(transaction, lockedState.id, lockedState.snapshotId);

      await transaction.commit();

      console.log(`Tables restored: ${tables.length}`);
      for (const table of tables) {
        console.log(`  - ${table.schemaName}.${table.tableName}`);
      }
      console.log('Demo mode is now inactive.');
    } catch (error) {
      await rollbackQuietly(transaction);
      throw error;
    }
  } finally {
    await pool.close();
  }
}
