import type { ConnectionPool, Transaction } from 'mssql';
import { getSqlPool } from '../../shared/database/sql-server.js';
import { env } from '../../config/env.js';
import { sql } from '../../shared/database/sql-server.js';
import { internalError } from '../../shared/errors/http-errors.js';

export const QA_NUMBER_FORMATS = ['QA-{date}-000X', 'QA-000X'] as const;
export const QA_NUMBER_TOKEN = '{number}';
export const QA_PADDED_NUMBER_TOKEN = '000X';
export const QA_DATE_TOKEN = '{date}';
export const DEFAULT_QA_NUMBER_FORMAT = 'QA-{date}-000X';

export type QaNumberFormat = string;
type NumberKey = 'QA' | 'DM' | 'CM';

interface NumberingRow {
  number_key: string;
  prefix: string;
  next_value: number | string;
  number_format?: string | null;
}

export function normalizeQaFormat(format: string | null | undefined): QaNumberFormat {
  const trimmed = String(format ?? '').trim();

  if (!trimmed) {
    return DEFAULT_QA_NUMBER_FORMAT;
  }

  if (trimmed === 'QA-Date-000X') {
    return DEFAULT_QA_NUMBER_FORMAT;
  }

  return trimmed;
}

function formatQaSequence(sequence: number) {
  const value = String(sequence);
  return value.length >= 3 ? value : value.padStart(4, '0');
}

function formatQaDate(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function countOccurrences(source: string, token: string) {
  if (!token) {
    return 0;
  }

  return source.split(token).length - 1;
}

export function getQaNumberTokenCount(format: string) {
  return (
    countOccurrences(format, QA_NUMBER_TOKEN) +
    countOccurrences(format, QA_PADDED_NUMBER_TOKEN)
  );
}

export function validateQaNumberFormat(format: string) {
  const normalized = normalizeQaFormat(format);
  const numberTokenCount = getQaNumberTokenCount(normalized);

  if (!normalized) {
    return 'Format is required';
  }

  if (numberTokenCount === 0) {
    return `Format must include ${QA_NUMBER_TOKEN} or ${QA_PADDED_NUMBER_TOKEN}`;
  }

  if (numberTokenCount > 1) {
    return 'Format must include only one number token';
  }

  return '';
}

function extractQaPrefix(format: string) {
  const normalized = normalizeQaFormat(format);
  const tokenIndexes = [
    normalized.indexOf(QA_DATE_TOKEN),
    normalized.indexOf(QA_NUMBER_TOKEN),
    normalized.indexOf(QA_PADDED_NUMBER_TOKEN),
  ].filter((value) => value >= 0);

  if (tokenIndexes.length === 0) {
    return normalized.slice(0, 20) || 'QA';
  }

  const prefix = normalized.slice(0, Math.min(...tokenIndexes)).trim();
  return prefix.slice(0, 20) || 'QA';
}

export function buildQaNumberPreview(
  format: QaNumberFormat,
  nextValue: number,
  date = new Date()
) {
  const normalized = normalizeQaFormat(format);
  const padded = formatQaSequence(nextValue);

  return normalized
    .replaceAll(QA_DATE_TOKEN, formatQaDate(date))
    .replaceAll(QA_PADDED_NUMBER_TOKEN, padded)
    .replaceAll(QA_NUMBER_TOKEN, String(nextValue));
}

async function getNumberingRow(
  executor: ConnectionPool | Transaction,
  numberKey: NumberKey,
  lock = false
) {
  const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
  const result = await executor
    .request()
    .input('numberKey', sql.NVarChar, numberKey)
    .query(`
      SELECT number_key, prefix, next_value, number_format
      FROM [${env.UTILITY_SCHEMA}].[qa_numbering] ${lockHint}
      WHERE number_key = @numberKey
    `);

  return (result.recordset[0] as NumberingRow | undefined) ?? null;
}

async function requireNumberingRow(
  executor: ConnectionPool | Transaction,
  numberKey: NumberKey,
  lock = false
) {
  const row = await getNumberingRow(executor, numberKey, lock);
  if (!row) {
    throw internalError(`Numbering key ${numberKey} is not configured`);
  }

  return row;
}

function buildReferenceNumberPreview(sequence: number) {
  return String(sequence);
}

export async function getQaNumberingSettings() {
  const pool = await getSqlPool();
  const qaRow = await requireNumberingRow(pool, 'QA');
  const dmRow = await requireNumberingRow(pool, 'DM');
  const cmRow = await requireNumberingRow(pool, 'CM');

  const nextValue = Number(qaRow.next_value);
  const format = normalizeQaFormat(qaRow.number_format);
  const dmNextValue = Number(dmRow.next_value);
  const cmNextValue = Number(cmRow.next_value);

  return {
    format,
    nextValue,
    preview: buildQaNumberPreview(format, nextValue),
    dmNextValue,
    dmPreview: buildReferenceNumberPreview(dmNextValue),
    cmNextValue,
    cmPreview: buildReferenceNumberPreview(cmNextValue),
  };
}

export async function updateQaNumberingSettings(input: {
  format: QaNumberFormat;
  nextValue: number;
  dmNextValue?: number;
  cmNextValue?: number;
}) {
  const format = normalizeQaFormat(input.format);
  const pool = await getSqlPool();
  const transaction = new sql.Transaction(pool);
  let beganTransaction = false;

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  beganTransaction = true;

  try {
    await requireNumberingRow(transaction, 'QA', true);
    await requireNumberingRow(transaction, 'DM', true);
    await requireNumberingRow(transaction, 'CM', true);

    await transaction
      .request()
      .input('nextValue', sql.BigInt, input.nextValue)
      .input('format', sql.NVarChar, format)
      .input('prefix', sql.NVarChar, extractQaPrefix(format))
      .query(`
        UPDATE [${env.UTILITY_SCHEMA}].[qa_numbering]
        SET
          prefix = @prefix,
          next_value = @nextValue,
          number_format = @format,
          updated_at = SYSUTCDATETIME()
        WHERE number_key = N'QA'
      `);

    if (input.dmNextValue != null) {
      await transaction
        .request()
        .input('nextValue', sql.BigInt, input.dmNextValue)
        .query(`
          UPDATE [${env.UTILITY_SCHEMA}].[qa_numbering]
          SET
            next_value = @nextValue,
            updated_at = SYSUTCDATETIME()
          WHERE number_key = N'DM'
        `);
    }

    if (input.cmNextValue != null) {
      await transaction
        .request()
        .input('nextValue', sql.BigInt, input.cmNextValue)
        .query(`
          UPDATE [${env.UTILITY_SCHEMA}].[qa_numbering]
          SET
            next_value = @nextValue,
            updated_at = SYSUTCDATETIME()
          WHERE number_key = N'CM'
        `);
    }

    await transaction.commit();
  } catch (error) {
    if (beganTransaction) {
      await transaction.rollback();
    }
    throw error;
  }

  return getQaNumberingSettings();
}

export async function generateNextQaNumberInTransaction(transaction: Transaction) {
  const current = await requireNumberingRow(transaction, 'QA', true);

  const sequence = Number(current.next_value);
  const format = normalizeQaFormat(current.number_format);
  const value = buildQaNumberPreview(format, sequence);

  await transaction
    .request()
    .input('numberKey', sql.NVarChar, 'QA')
    .query(`
      UPDATE [${env.UTILITY_SCHEMA}].[qa_numbering]
      SET
        next_value = next_value + 1,
        updated_at = SYSUTCDATETIME()
      WHERE number_key = @numberKey
    `);

  return {
    sequence,
    format,
    value,
  };
}

export async function allocateNextNumber(
  transaction: Transaction,
  numberKey: NumberKey
) {
  const current = await requireNumberingRow(transaction, numberKey, true);

  const sequence = Number(current.next_value);

  await transaction
    .request()
    .input('numberKey', sql.NVarChar, numberKey)
    .query(`
      UPDATE [${env.UTILITY_SCHEMA}].[qa_numbering]
      SET
        next_value = next_value + 1,
        updated_at = SYSUTCDATETIME()
      WHERE number_key = @numberKey
    `);

  return {
    sequence,
    value:
      numberKey === 'QA'
        ? buildQaNumberPreview(normalizeQaFormat(current.number_format), sequence)
        : buildReferenceNumberPreview(sequence),
  };
}

export async function getNumberingPreview() {
  const pool = await getSqlPool();
  const result = await pool.request().query(`
    SELECT number_key, prefix, next_value, number_format
    FROM [${env.UTILITY_SCHEMA}].[qa_numbering]
    WHERE number_key IN (N'QA', N'DM', N'CM')
  `);

  const previews = {
    QA: '',
    DM: '',
    CM: '',
  };

  for (const row of result.recordset as Array<Record<string, unknown>>) {
    const numberKey = String(row.number_key) as NumberKey;
    const sequence = Number(row.next_value);

    previews[numberKey] =
      numberKey === 'QA'
        ? buildQaNumberPreview(normalizeQaFormat(String(row.number_format ?? '')), sequence)
        : buildReferenceNumberPreview(sequence);
  }

  return previews;
}
