"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLegacyPermissionRecord = getLegacyPermissionRecord;
exports.verifyLegacyCredentials = verifyLegacyCredentials;
exports.getRolePermissionOverrides = getRolePermissionOverrides;
exports.getAllRolePermissions = getAllRolePermissions;
exports.upsertRolePermissions = upsertRolePermissions;
const env_js_1 = require("../../config/env.js");
const sql_server_js_1 = require("../../shared/database/sql-server.js");
async function getLegacyPermissionRecord(legacyUserId) {
    const trimmedUserId = legacyUserId.trim();
    if (!trimmedUserId) {
        return null;
    }
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const result = await pool
        .request()
        .input('legacyUserId', sql_server_js_1.sql.NVarChar, trimmedUserId)
        .query(`
      SELECT
        ua.user_id AS legacyUserId,
        CASE
          WHEN ISNUMERIC(ua.access_type) = 1 THEN CAST(ua.access_type AS INT)
          ELSE NULL
        END AS accessType,
        CASE WHEN ISNULL(ua.adjustment_page_access, 0) <> 0 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS adjustmentPageAccess,
        CASE WHEN ISNULL(ua.adjustment_edit_access, 0) <> 0 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS adjustmentEditAccess,
        CASE WHEN ISNULL(ua.adjustment_delete_access, 0) <> 0 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS adjustmentDeleteAccess,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM node_user_group_map gm
            INNER JOIN node_usergroups g
              ON g.id = gm.group_id
            WHERE gm.user_id = ua.user_id
              AND g.title = 'Super Users'
          )
          THEN CAST(1 AS BIT)
          ELSE CAST(0 AS BIT)
        END AS isSuperUser
      FROM user_access ua
      WHERE ua.user_id = @legacyUserId
    `);
    if (result.recordset.length === 0) {
        return null;
    }
    const row = result.recordset[0];
    return {
        legacyUserId: row.legacyUserId,
        accessType: row.accessType,
        adjustmentPageAccess: Boolean(row.adjustmentPageAccess),
        adjustmentEditAccess: Boolean(row.adjustmentEditAccess),
        adjustmentDeleteAccess: Boolean(row.adjustmentDeleteAccess),
        isSuperUser: Boolean(row.isSuperUser),
    };
}
async function verifyLegacyCredentials(username, password) {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const uaResult = await pool
        .request()
        .input('legacyUserId', sql_server_js_1.sql.NVarChar, username.trim())
        .query(`
      SELECT TOP 1
        user_id AS legacyUserId,
        user_password AS legacyPassword
      FROM user_access
      WHERE user_id = @legacyUserId
    `);
    if (uaResult.recordset.length > 0) {
        const row = uaResult.recordset[0];
        const legacyPassword = String(row.legacyPassword ?? '').trim();
        if (legacyPassword !== password) {
            return null;
        }
        return getLegacyPermissionRecord(row.legacyUserId);
    }
    const userResult = await pool
        .request()
        .input('cashierId', sql_server_js_1.sql.NVarChar, username.trim())
        .query(`
      SELECT TOP 1
        cashierid AS legacyUserId,
        password AS legacyPassword,
        user_level AS userLevel
      FROM [user]
      WHERE cashierid = @cashierId
    `);
    if (userResult.recordset.length > 0) {
        const row = userResult.recordset[0];
        const legacyPassword = String(row.legacyPassword ?? '').trim();
        if (legacyPassword !== password) {
            return null;
        }
        return {
            legacyUserId: String(row.legacyUserId),
            accessType: row.userLevel != null ? Number(row.userLevel) : null,
            adjustmentPageAccess: false,
            adjustmentEditAccess: false,
            adjustmentDeleteAccess: false,
            isSuperUser: false,
        };
    }
    return null;
}
const PERMISSION_KEYS = [
    'dashboardRead',
    'inventoryRead',
    'inventoryWrite',
    'auditRead',
    'usersRead',
    'usersWrite',
    'permissionsRead',
    'permissionsWrite',
    'adjustmentPageAccess',
    'adjustmentSave',
    'adjustmentEdit',
    'adjustmentDelete',
    'adjustmentPost',
    'adjustmentPrint',
];
async function getRolePermissionOverrides(roleId) {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const result = await pool
        .request()
        .input('roleId', sql_server_js_1.sql.Int, roleId)
        .query(`
      SELECT permission_key, permission_value
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[role_permissions]
      WHERE role_id = @roleId
    `);
    const overrides = {};
    for (const row of result.recordset) {
        const key = row.permission_key;
        if (PERMISSION_KEYS.includes(key)) {
            overrides[key] = Boolean(row.permission_value);
        }
    }
    return overrides;
}
async function getAllRolePermissions() {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const [rolesResult, permsResult] = await Promise.all([
        pool.request().query(`
      SELECT role_id AS roleId, role_name AS roleName
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[app_roles]
      ORDER BY role_id ASC
    `),
        pool.request().query(`
      SELECT role_id AS roleId, permission_key AS permKey, permission_value AS permValue
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[role_permissions]
    `),
    ]);
    const overridesByRole = new Map();
    for (const row of permsResult.recordset) {
        if (!overridesByRole.has(row.roleId)) {
            overridesByRole.set(row.roleId, {});
        }
        const key = row.permKey;
        if (PERMISSION_KEYS.includes(key)) {
            overridesByRole.get(row.roleId)[key] = Boolean(row.permValue);
        }
    }
    return rolesResult.recordset.map((role) => ({
        roleId: role.roleId,
        roleName: role.roleName,
        permissions: overridesByRole.get(role.roleId) ?? {},
    }));
}
async function upsertRolePermissions(roleId, permissions) {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const entries = Object.entries(permissions);
    for (const [key, value] of entries) {
        if (!PERMISSION_KEYS.includes(key))
            continue;
        await pool
            .request()
            .input('roleId', sql_server_js_1.sql.Int, roleId)
            .input('permKey', sql_server_js_1.sql.NVarChar, key)
            .input('permValue', sql_server_js_1.sql.Bit, value ? 1 : 0)
            .query(`
        MERGE [${env_js_1.env.UTILITY_SCHEMA}].[role_permissions] AS target
        USING (SELECT @roleId AS role_id, @permKey AS permission_key) AS source
          ON target.role_id = source.role_id AND target.permission_key = source.permission_key
        WHEN MATCHED THEN
          UPDATE SET permission_value = @permValue, updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (role_id, permission_key, permission_value)
          VALUES (@roleId, @permKey, @permValue);
      `);
    }
}
