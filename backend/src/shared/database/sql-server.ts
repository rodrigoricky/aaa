import sql from 'mssql';
import { env } from '../../config/env.js';

const sqlConfig: sql.config = {
  server: env.SQLSERVER_HOST,
  port: env.SQLSERVER_PORT,
  database: env.SQLSERVER_DATABASE,
  user: env.SQLSERVER_USER,
  password: env.SQLSERVER_PASSWORD,
  pool: {
    min: env.SQLSERVER_POOL_MIN,
    max: env.SQLSERVER_POOL_MAX,
    idleTimeoutMillis: 30_000,
  },
  options: {
    encrypt: env.SQLSERVER_ENCRYPT,
    trustServerCertificate: env.SQLSERVER_TRUST_SERVER_CERTIFICATE,
    enableArithAbort: true,
  },
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;
let activePool: sql.ConnectionPool | null = null;

export function getSqlConfig() {
  return sqlConfig;
}

export async function getSqlPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(sqlConfig);
    activePool = pool;

    pool.on('error', (error) => {
      console.error('SQL Server pool error:', error);
      if (activePool === pool) {
        poolPromise = null;
        activePool = null;
      }
      pool.close().catch((closeError: unknown) => {
        console.error('SQL Server pool close after error failed:', closeError);
      });
    });

    poolPromise = pool.connect().catch((error: unknown) => {
      poolPromise = null;
      activePool = null;
      throw error;
    });
  }

  return poolPromise;
}

export async function closeSqlPool() {
  if (!poolPromise) {
    return;
  }

  const pool = await poolPromise;
  poolPromise = null;
  activePool = null;
  await pool.close();
}

export async function withTransaction<T>(
  work: (transaction: sql.Transaction) => Promise<T>,
  isolationLevel = sql.ISOLATION_LEVEL.READ_COMMITTED
) {
  const pool = await getSqlPool();
  const transaction = new sql.Transaction(pool);
  let rolledBack = false;

  await transaction.begin(isolationLevel);

  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    if (!rolledBack) {
      rolledBack = true;
      await transaction.rollback().catch((rollbackError: unknown) => {
        console.error('SQL transaction rollback failed:', rollbackError);
      });
    }
    throw error;
  }
}

export { sql };
