"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = void 0;
exports.getSqlConfig = getSqlConfig;
exports.getSqlPool = getSqlPool;
exports.closeSqlPool = closeSqlPool;
exports.withTransaction = withTransaction;
const mssql_1 = __importDefault(require("mssql"));
exports.sql = mssql_1.default;
const env_js_1 = require("../../config/env.js");
const sqlConfig = {
    server: env_js_1.env.SQLSERVER_HOST,
    port: env_js_1.env.SQLSERVER_PORT,
    database: env_js_1.env.SQLSERVER_DATABASE,
    user: env_js_1.env.SQLSERVER_USER,
    password: env_js_1.env.SQLSERVER_PASSWORD,
    pool: {
        min: env_js_1.env.SQLSERVER_POOL_MIN,
        max: env_js_1.env.SQLSERVER_POOL_MAX,
        idleTimeoutMillis: 30_000,
    },
    options: {
        encrypt: env_js_1.env.SQLSERVER_ENCRYPT,
        trustServerCertificate: env_js_1.env.SQLSERVER_TRUST_SERVER_CERTIFICATE,
        enableArithAbort: true,
    },
};
let poolPromise = null;
let activePool = null;
function getSqlConfig() {
    return sqlConfig;
}
async function getSqlPool() {
    if (!poolPromise) {
        const pool = new mssql_1.default.ConnectionPool(sqlConfig);
        activePool = pool;
        pool.on('error', (error) => {
            console.error('SQL Server pool error:', error);
            if (activePool === pool) {
                poolPromise = null;
                activePool = null;
            }
            pool.close().catch((closeError) => {
                console.error('SQL Server pool close after error failed:', closeError);
            });
        });
        poolPromise = pool.connect().catch((error) => {
            poolPromise = null;
            activePool = null;
            throw error;
        });
    }
    return poolPromise;
}
async function closeSqlPool() {
    if (!poolPromise) {
        return;
    }
    const pool = await poolPromise;
    poolPromise = null;
    activePool = null;
    await pool.close();
}
async function withTransaction(work, isolationLevel = mssql_1.default.ISOLATION_LEVEL.READ_COMMITTED) {
    const pool = await getSqlPool();
    const transaction = new mssql_1.default.Transaction(pool);
    let rolledBack = false;
    await transaction.begin(isolationLevel);
    try {
        const result = await work(transaction);
        await transaction.commit();
        return result;
    }
    catch (error) {
        if (!rolledBack) {
            rolledBack = true;
            await transaction.rollback().catch((rollbackError) => {
                console.error('SQL transaction rollback failed:', rollbackError);
            });
        }
        throw error;
    }
}
