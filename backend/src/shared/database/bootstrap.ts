import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { getSqlPool, sql } from './sql-server.js';
import { hashPassword } from '../utils/password.js';

function resolveSqlScriptPath() {
  return path.resolve(process.cwd(), 'sql', '001_init_utility_schema.sql');
}

function getSchemaScript(script: string) {
  return script.replaceAll('[utility]', `[${env.UTILITY_SCHEMA}]`);
}

function splitBatches(script: string) {
  return script
    .split(/^\s*GO\s*$/gim)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

export async function ensureUtilitySchema() {
  if (!env.UTILITY_AUTO_INIT) {
    return;
  }

  const pool = await getSqlPool();
  const rawScript = await readFile(resolveSqlScriptPath(), 'utf8');
  const script = getSchemaScript(rawScript);
  const batches = splitBatches(script);

  for (const batch of batches) {
    await pool.request().batch(batch);
  }

  await ensureNumberingRows();
  await ensureBootstrapAdmin();
}

async function ensureNumberingRows() {
  const pool = await getSqlPool();
  const defaults = [
    {
      numberKey: 'QA',
      prefix: 'QA',
      start: env.QA_NUMBER_START,
      numberFormat: 'QA-{date}-000X',
    },
    { numberKey: 'DM', prefix: 'DM', start: env.DM_NUMBER_START },
    { numberKey: 'CM', prefix: 'CM', start: env.CM_NUMBER_START },
  ];

  for (const row of defaults) {
    await pool
      .request()
      .input('numberKey', sql.NVarChar, row.numberKey)
      .input('prefix', sql.NVarChar, row.prefix)
      .input('nextValue', sql.BigInt, row.start)
      .input('numberFormat', sql.NVarChar, 'numberFormat' in row ? row.numberFormat : null)
      .query(`
        IF NOT EXISTS (
          SELECT 1
          FROM [${env.UTILITY_SCHEMA}].[qa_numbering]
          WHERE number_key = @numberKey
        )
        BEGIN
          INSERT INTO [${env.UTILITY_SCHEMA}].[qa_numbering] (
            number_key,
            prefix,
            next_value,
            number_format
          )
          VALUES (@numberKey, @prefix, @nextValue, @numberFormat);
        END

        IF @numberKey = N'QA'
        BEGIN
          UPDATE [${env.UTILITY_SCHEMA}].[qa_numbering]
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
  if (!env.UTILITY_BOOTSTRAP_ADMIN_PASSWORD) {
    return;
  }

  const pool = await getSqlPool();
  const countResult = await pool.request().query(`
    SELECT COUNT(*) AS total
    FROM [${env.UTILITY_SCHEMA}].[app_users]
  `);

  if (countResult.recordset[0]?.total > 0) {
    return;
  }

  const passwordHash = await hashPassword(env.UTILITY_BOOTSTRAP_ADMIN_PASSWORD);

  await pool
    .request()
    .input('username', sql.NVarChar, env.UTILITY_BOOTSTRAP_ADMIN_USERNAME)
    .input('passwordHash', sql.NVarChar, passwordHash)
    .query(`
      INSERT INTO [${env.UTILITY_SCHEMA}].[app_users] (
        username,
        password_hash,
        role_id,
        is_active
      )
      VALUES (@username, @passwordHash, 1, 1);
    `);
}
