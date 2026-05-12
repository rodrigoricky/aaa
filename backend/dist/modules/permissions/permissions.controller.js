"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetAllPermissions = handleGetAllPermissions;
exports.handleUpdateRolePermissions = handleUpdateRolePermissions;
const zod_1 = require("zod");
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const api_response_js_1 = require("../../shared/http/api-response.js");
const permissions_service_js_1 = require("./permissions.service.js");
const permissions_repository_js_1 = require("./permissions.repository.js");
const sql_server_js_1 = require("../../shared/database/sql-server.js");
const env_js_1 = require("../../config/env.js");
async function handleGetAllPermissions(_request, reply) {
    const dbRoles = await (0, permissions_repository_js_1.getAllRolePermissions)();
    const data = dbRoles.map((role) => {
        const defaults = (0, permissions_service_js_1.getRolePermissionDefaults)(role.roleName);
        const effective = { ...defaults, ...role.permissions };
        return {
            roleId: role.roleId,
            roleName: role.roleName,
            permissions: effective,
        };
    });
    return (0, api_response_js_1.sendSuccess)(reply, data);
}
const updatePermissionsBodySchema = zod_1.z.object({
    permissions: zod_1.z.record(zod_1.z.boolean()),
});
async function handleUpdateRolePermissions(request, reply) {
    const roleId = Number(request.params.roleId);
    if (!Number.isInteger(roleId) || roleId < 1) {
        throw (0, http_errors_js_1.badRequest)('Invalid role ID');
    }
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const roleCheck = await pool
        .request()
        .input('roleId', sql_server_js_1.sql.Int, roleId)
        .query(`SELECT role_name FROM [${env_js_1.env.UTILITY_SCHEMA}].[app_roles] WHERE role_id = @roleId`);
    if (roleCheck.recordset.length === 0) {
        throw (0, http_errors_js_1.notFound)('Role not found');
    }
    const parsed = updatePermissionsBodySchema.safeParse(request.body);
    if (!parsed.success) {
        throw (0, http_errors_js_1.badRequest)('Validation error', parsed.error.flatten().fieldErrors);
    }
    await (0, permissions_repository_js_1.upsertRolePermissions)(roleId, parsed.data.permissions);
    const dbRoles = await (0, permissions_repository_js_1.getAllRolePermissions)();
    const updated = dbRoles.find((r) => r.roleId === roleId);
    if (!updated)
        throw (0, http_errors_js_1.notFound)('Role not found');
    const roleName = roleCheck.recordset[0].role_name;
    const defaults = (0, permissions_service_js_1.getRolePermissionDefaults)(roleName);
    const effective = { ...defaults, ...updated.permissions };
    return (0, api_response_js_1.sendSuccess)(reply, { roleId, roleName, permissions: effective });
}
