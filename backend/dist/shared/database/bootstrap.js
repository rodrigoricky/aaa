"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUtilitySchema = ensureUtilitySchema;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const env_js_1 = require("../../config/env.js");
const sql_server_js_1 = require("./sql-server.js");
const password_js_1 = require("../utils/password.js");
async function resolveSqlScriptPaths() {
    const sqlDir = node_path_1.default.resolve(process.cwd(), 'sql');
    const entries = await (0, promises_1.readdir)(sqlDir);
    return entries
        .filter((entry) => /^\d+_.+\.sql$/i.test(entry))
        .sort((left, right) => left.localeCompare(right))
        .map((entry) => node_path_1.default.join(sqlDir, entry));
}
function getSchemaScript(script) {
    return script.replaceAll('[utility]', `[${env_js_1.env.UTILITY_SCHEMA}]`);
}
function splitBatches(script) {
    return script
        .split(/^\s*GO\s*$/gim)
        .map((chunk) => chunk.trim())
        .filter(Boolean);
}
async function ensureUtilitySchema() {
    if (!env_js_1.env.UTILITY_AUTO_INIT) {
        return;
    }
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const scriptPaths = await resolveSqlScriptPaths();
    for (const scriptPath of scriptPaths) {
        const rawScript = await (0, promises_1.readFile)(scriptPath, 'utf8');
        const script = getSchemaScript(rawScript);
        const batches = splitBatches(script);
        for (const batch of batches) {
            await pool.request().batch(batch);
        }
    }
    await ensureNumberingRows();
    await ensureBootstrapAdmin();
}
async function ensureNumberingRows() {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const defaults = [
        {
            numberKey: 'QA',
            prefix: 'QA',
            start: env_js_1.env.QA_NUMBER_START,
            numberFormat: 'QA-{date}-000X',
        },
        { numberKey: 'DM', prefix: 'DM', start: env_js_1.env.DM_NUMBER_START },
        { numberKey: 'CM', prefix: 'CM', start: env_js_1.env.CM_NUMBER_START },
    ];
    for (const row of defaults) {
        await pool
            .request()
            .input('numberKey', sql_server_js_1.sql.NVarChar, row.numberKey)
            .input('prefix', sql_server_js_1.sql.NVarChar, row.prefix)
            .input('nextValue', sql_server_js_1.sql.BigInt, row.start)
            .input('numberFormat', sql_server_js_1.sql.NVarChar, 'numberFormat' in row ? row.numberFormat : null)
            .query(`
        IF NOT EXISTS (
          SELECT 1
          FROM [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering]
          WHERE number_key = @numberKey
        )
        BEGIN
          INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering] (
            number_key,
            prefix,
            next_value,
            number_format
          )
          VALUES (@numberKey, @prefix, @nextValue, @numberFormat);
        END

        IF @numberKey = N'QA'
        BEGIN
          UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[qa_numbering]
          SET
            prefix = @prefix,
            number_format = COALESCE(NULLIF(number_format, N''), @numberFormat),
            updated_at = SYSUTCDATETIME()
          WHERE number_key = @numberKey;
        END
      `);
    }
}
async function ensureBootstrapAdmin() {
    if (!env_js_1.env.UTILITY_BOOTSTRAP_ADMIN_PASSWORD) {
        return;
    }
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const countResult = await pool.request().query(`
    SELECT COUNT(*) AS total
    FROM [${env_js_1.env.UTILITY_SCHEMA}].[app_users]
  `);
    if (countResult.recordset[0]?.total > 0) {
        return;
    }
    const passwordHash = await (0, password_js_1.hashPassword)(env_js_1.env.UTILITY_BOOTSTRAP_ADMIN_PASSWORD);
    await pool
        .request()
        .input('username', sql_server_js_1.sql.NVarChar, env_js_1.env.UTILITY_BOOTSTRAP_ADMIN_USERNAME)
        .input('passwordHash', sql_server_js_1.sql.NVarChar, passwordHash)
        .query(`
      INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[app_users] (
        username,
        password_hash,
        role_id,
        is_active
      )
      VALUES (@username, @passwordHash, 1, 1);
    `);
}
