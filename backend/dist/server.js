"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/env.js");
const app_js_1 = require("./app.js");
const env_js_1 = require("./config/env.js");
const bootstrap_js_1 = require("./shared/database/bootstrap.js");
const sql_server_js_1 = require("./shared/database/sql-server.js");
const start = async () => {
    const app = await (0, app_js_1.buildApp)();
    try {
        await (0, sql_server_js_1.getSqlPool)();
        await (0, bootstrap_js_1.ensureUtilitySchema)();
        app.log.info('SQL Server connected');
        await app.listen({ port: env_js_1.env.PORT, host: env_js_1.env.HOST });
        app.log.info(`Server running on http://${env_js_1.env.HOST}:${env_js_1.env.PORT}`);
    }
    catch (error) {
        app.log.error(error);
        await (0, sql_server_js_1.closeSqlPool)();
        process.exit(1);
    }
};
const shutdown = async () => {
    await (0, sql_server_js_1.closeSqlPool)();
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await (0, sql_server_js_1.closeSqlPool)().catch(() => undefined);
    process.exit(1);
});
start();
