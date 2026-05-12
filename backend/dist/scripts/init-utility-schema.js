"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env.js");
const bootstrap_js_1 = require("../shared/database/bootstrap.js");
const sql_server_js_1 = require("../shared/database/sql-server.js");
async function main() {
    await (0, sql_server_js_1.getSqlPool)();
    await (0, bootstrap_js_1.ensureUtilitySchema)();
    console.log('Utility schema initialized successfully.');
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await (0, sql_server_js_1.closeSqlPool)();
});
