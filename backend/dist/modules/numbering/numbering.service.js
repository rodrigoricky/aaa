"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_QA_NUMBER_FORMAT = exports.QA_DATE_TOKEN = exports.QA_PADDED_NUMBER_TOKEN = exports.QA_NUMBER_TOKEN = exports.QA_NUMBER_FORMATS = void 0;
exports.normalizeQaFormat = normalizeQaFormat;
exports.getQaNumberTokenCount = getQaNumberTokenCount;
exports.validateQaNumberFormat = validateQaNumberFormat;
exports.buildQaNumberPreview = buildQaNumberPreview;
exports.getQaNumberingSettings = getQaNumberingSettings;
exports.updateQaNumberingSettings = updateQaNumberingSettings;
exports.generateNextQaNumberInTransaction = generateNextQaNumberInTransaction;
exports.allocateNextNumber = allocateNextNumber;
exports.getNumberingPreview = getNumberingPreview;
const sql_server_js_1 = require("../../shared/database/sql-server.js");
const env_js_1 = require("../../config/env.js");
const sql_server_js_2 = require("../../shared/database/sql-server.js");
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
exports.QA_NUMBER_FORMATS = ['QA-{date}-000X', 'QA-000X'];
exports.QA_NUMBER_TOKEN = '{number}';
exports.QA_PADDED_NUMBER_TOKEN = '000X';
exports.QA_DATE_TOKEN = '{date}';
exports.DEFAULT_QA_NUMBER_FORMAT = 'QA-{date}-000X';
function normalizeQaFormat(format) {
    const trimmed = String(format ?? '').trim();
    if (!trimmed) {
        return exports.DEFAULT_QA_NUMBER_FORMAT;
    }
    if (trimmed === 'QA-Date-000X') {
        return exports.DEFAULT_QA_NUMBER_FORMAT;
    }
    return trimmed;
}
function formatQaSequence(sequence) {
    const value = String(sequence);
    return value.length >= 3 ? value : value.padStart(4, '0');
}
function formatQaDate(date = new Date()) {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
}
function countOccurrences(source, token) {
    if (!token) {
        return 0;
    }
    return source.split(token).length - 1;
}
function getQaNumberTokenCount(format) {
    return (countOccurrences(format, exports.QA_NUMBER_TOKEN) +
        countOccurrences(format, exports.QA_PADDED_NUMBER_TOKEN));
}
function validateQaNumberFormat(format) {
    const normalized = normalizeQaFormat(format);
    const numberTokenCount = getQaNumberTokenCount(normalized);
    if (!normalized) {
        return 'Format is required';
    }
    if (numberTokenCount === 0) {
        return `Format must include ${exports.QA_NUMBER_TOKEN} or ${exports.QA_PADDED_NUMBER_TOKEN}`;
    }
    if (numberTokenCount > 1) {
        return 'Format must include only one number token';
    }
    return '';
}
function extractQaPrefix(format) {
    const normalized = normalizeQaFormat(format);
    const tokenIndexes = [
        normalized.indexOf(exports.QA_DATE_TOKEN),
        normalized.indexOf(exports.QA_NUMBER_TOKEN),
        normalized.indexOf(exports.QA_PADDED_NUMBER_TOKEN),
    ].filter((value) => value >= 0);
    if (tokenIndexes.length === 0) {
        return normalized.slice(0, 20) || 'QA';
    }
    const prefix = normalized.slice(0, Math.min(...tokenIndexes)).trim();
    return prefix.slice(0, 20) || 'QA';
}
function buildQaNumberPreview(format, nextValue, date = new Date()) {
    const normalized = normalizeQaFormat(format);
    const padded = formatQaSequence(nextValue);
    return normalized
        .replaceAll(exports.QA_DATE_TOKEN, formatQaDate(date))
        .replaceAll(exports.QA_PADDED_NUMBER_TOKEN, padded)
        .replaceAll(exports.QA_NUMBER_TOKEN, String(nextValue));
}
async function getNumberingRow(executor, numberKey, lock = false) {
    const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
    const result = await executor
        .request()
        .input('numberKey', sql_server_js_2.sql.NVarChar, numberKey)
        .query(`
      SELECT number_key, prefix, next_value, number_format
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering] ${lockHint}
      WHERE number_key = @numberKey
    `);
    return result.recordset[0] ?? null;
}
async function requireNumberingRow(executor, numberKey, lock = false) {
    const row = await getNumberingRow(executor, numberKey, lock);
    if (!row) {
        throw (0, http_errors_js_1.internalError)(`Numbering key ${numberKey} is not configured`);
    }
    return row;
}
function buildReferenceNumberPreview(sequence) {
    return String(sequence);
}
async function getQaNumberingSettings() {
    const pool = await (0, sql_server_js_1.getSqlPool)();
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
async function updateQaNumberingSettings(input) {
    const format = normalizeQaFormat(input.format);
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const transaction = new sql_server_js_2.sql.Transaction(pool);
    let beganTransaction = false;
    await transaction.begin(sql_server_js_2.sql.ISOLATION_LEVEL.SERIALIZABLE);
    beganTransaction = true;
    try {
        await requireNumberingRow(transaction, 'QA', true);
        await requireNumberingRow(transaction, 'DM', true);
        await requireNumberingRow(transaction, 'CM', true);
        await transaction
            .request()
            .input('nextValue', sql_server_js_2.sql.BigInt, input.nextValue)
            .input('format', sql_server_js_2.sql.NVarChar, format)
            .input('prefix', sql_server_js_2.sql.NVarChar, extractQaPrefix(format))
            .query(`
        UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering]
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
                .input('nextValue', sql_server_js_2.sql.BigInt, input.dmNextValue)
                .query(`
          UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering]
          SET
            next_value = @nextValue,
            updated_at = SYSUTCDATETIME()
          WHERE number_key = N'DM'
        `);
        }
        if (input.cmNextValue != null) {
            await transaction
                .request()
                .input('nextValue', sql_server_js_2.sql.BigInt, input.cmNextValue)
                .query(`
          UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering]
          SET
            next_value = @nextValue,
            updated_at = SYSUTCDATETIME()
          WHERE number_key = N'CM'
        `);
        }
        await transaction.commit();
    }
    catch (error) {
        if (beganTransaction) {
            await transaction.rollback();
        }
        throw error;
    }
    return getQaNumberingSettings();
}
async function generateNextQaNumberInTransaction(transaction) {
    const current = await requireNumberingRow(transaction, 'QA', true);
    const sequence = Number(current.next_value);
    const format = normalizeQaFormat(current.number_format);
    const value = buildQaNumberPreview(format, sequence);
    await transaction
        .request()
        .input('numberKey', sql_server_js_2.sql.NVarChar, 'QA')
        .query(`
      UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering]
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
async function allocateNextNumber(transaction, numberKey) {
    const current = await requireNumberingRow(transaction, numberKey, true);
    const sequence = Number(current.next_value);
    await transaction
        .request()
        .input('numberKey', sql_server_js_2.sql.NVarChar, numberKey)
        .query(`
      UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering]
      SET
        next_value = next_value + 1,
        updated_at = SYSUTCDATETIME()
      WHERE number_key = @numberKey
    `);
    return {
        sequence,
        value: numberKey === 'QA'
            ? buildQaNumberPreview(normalizeQaFormat(current.number_format), sequence)
            : buildReferenceNumberPreview(sequence),
    };
}
async function getNumberingPreview() {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const result = await pool.request().query(`
    SELECT number_key, prefix, next_value, number_format
    FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering]
    WHERE number_key IN (N'QA', N'DM', N'CM')
  `);
    const previews = {
        QA: '',
        DM: '',
        CM: '',
    };
    for (const row of result.recordset) {
        const numberKey = String(row.number_key);
        const sequence = Number(row.next_value);
        previews[numberKey] =
            numberKey === 'QA'
                ? buildQaNumberPreview(normalizeQaFormat(String(row.number_format ?? '')), sequence)
                : buildReferenceNumberPreview(sequence);
    }
    return previews;
}
