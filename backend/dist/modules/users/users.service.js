"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateUtilityUser = authenticateUtilityUser;
exports.loginWithProvisioning = loginWithProvisioning;
exports.getAppUserById = getAppUserById;
exports.getAllUsers = getAllUsers;
exports.getUserById = getUserById;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.resetUserPassword = resetUserPassword;
exports.getAllRoles = getAllRoles;
const env_js_1 = require("../../config/env.js");
const sql_server_js_1 = require("../../shared/database/sql-server.js");
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const password_js_1 = require("../../shared/utils/password.js");
const value_js_1 = require("../../shared/utils/value.js");
const audit_js_1 = require("../../utils/audit.js");
const permissions_service_js_1 = require("../permissions/permissions.service.js");
const permissions_repository_js_1 = require("../permissions/permissions.repository.js");
function mapUserSummary(row, permissions) {
    return {
        id: String(row.userId),
        username: row.username,
        isActive: row.isActive,
        lastLogin: (0, value_js_1.toIsoString)(row.lastLoginAt),
        createdAt: (0, value_js_1.toIsoString)(row.createdAt),
        updatedAt: (0, value_js_1.toIsoString)(row.updatedAt),
        legacyUserId: row.legacyUserId,
        role: {
            id: row.roleId,
            name: row.roleName,
        },
        permissions: permissions ?? (0, permissions_service_js_1.getRolePermissions)(row.roleName),
    };
}
function mapLegacyUser(row) {
    return {
        id: String(row.id),
        username: String(row.id),
        fullName: row.fullName,
        source: row.source,
        accessType: row.accessType,
        adjustmentPageAccess: row.adjustmentPageAccess,
        adjustmentEditAccess: row.adjustmentEditAccess,
        adjustmentDeleteAccess: row.adjustmentDeleteAccess,
        isSuperUser: row.isSuperUser,
        isSecurityLevel2: row.isSuperUser || row.accessType === 2,
        linkedUtilityUser: row.linkedUtilityUserId
            ? {
                id: String(row.linkedUtilityUserId),
                username: row.linkedUtilityUsername,
            }
            : null,
    };
}
async function mapAuthenticatedUser(row) {
    const [legacyPermissions, roleOverrides] = await Promise.all([
        row.legacyUserId ? (0, permissions_repository_js_1.getLegacyPermissionRecord)(row.legacyUserId) : Promise.resolve(null),
        (0, permissions_repository_js_1.getRolePermissionOverrides)(row.roleId),
    ]);
    return {
        id: row.userId,
        username: row.username,
        role: row.roleName,
        roleId: row.roleId,
        isActive: row.isActive,
        legacyUserId: row.legacyUserId,
        permissions: (0, permissions_service_js_1.buildEffectivePermissions)(row.roleName, legacyPermissions, row.username, roleOverrides),
    };
}
async function getAppUserRowByUsername(username) {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const result = await pool
        .request()
        .input('username', sql_server_js_1.sql.NVarChar, username.trim())
        .query(`
      SELECT TOP 1
        u.user_id AS userId,
        u.username AS username,
        u.password_hash AS passwordHash,
        u.role_id AS roleId,
        r.role_name AS roleName,
        u.legacy_user_id AS legacyUserId,
        u.is_active AS isActive,
        u.last_login_at AS lastLoginAt,
        u.created_at AS createdAt,
        u.updated_at AS updatedAt
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[app_users] u
      INNER JOIN [${env_js_1.env.UTILITY_SCHEMA}].[app_roles] r
        ON r.role_id = u.role_id
      WHERE u.username = @username
    `);
    return result.recordset[0] ?? null;
}
async function getAppUserRowById(userId) {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const result = await pool
        .request()
        .input('userId', sql_server_js_1.sql.BigInt, userId)
        .query(`
      SELECT TOP 1
        u.user_id AS userId,
        u.username AS username,
        u.password_hash AS passwordHash,
        u.role_id AS roleId,
        r.role_name AS roleName,
        u.legacy_user_id AS legacyUserId,
        u.is_active AS isActive,
        u.last_login_at AS lastLoginAt,
        u.created_at AS createdAt,
        u.updated_at AS updatedAt
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[app_users] u
      INNER JOIN [${env_js_1.env.UTILITY_SCHEMA}].[app_roles] r
        ON r.role_id = u.role_id
      WHERE u.user_id = @userId
    `);
    return result.recordset[0] ?? null;
}
async function authenticateUtilityUser(username, password) {
    const userRow = await getAppUserRowByUsername(username);
    if (!userRow) {
        return null;
    }
    if (!userRow.isActive) {
        throw (0, http_errors_js_1.badRequest)('Account is deactivated');
    }
    const isValid = await (0, password_js_1.comparePassword)(password, userRow.passwordHash);
    if (!isValid) {
        throw (0, http_errors_js_1.unauthorized)('Invalid credentials');
    }
    return userRow;
}
async function provisionLegacyUser(username, password) {
    if (!env_js_1.env.LEGACY_AUTH_PROVISIONING_ENABLED) {
        return null;
    }
    const legacyRecord = await (0, permissions_repository_js_1.verifyLegacyCredentials)(username, password);
    if (!legacyRecord) {
        return null;
    }
    const existing = await getAppUserRowByUsername(username);
    if (existing) {
        return existing;
    }
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const passwordHash = await (0, password_js_1.hashPassword)(password);
    const role = (0, permissions_service_js_1.deriveRoleFromLegacyAccess)(legacyRecord);
    const roleIdMap = {
        Admin: 1,
        Supervisor: 2,
        Encoder: 3,
        'POS User': 4,
        'Security Level 2': 5,
    };
    const result = await pool
        .request()
        .input('username', sql_server_js_1.sql.NVarChar, username.trim())
        .input('passwordHash', sql_server_js_1.sql.NVarChar, passwordHash)
        .input('roleId', sql_server_js_1.sql.Int, roleIdMap[role])
        .input('legacyUserId', sql_server_js_1.sql.NVarChar, legacyRecord.legacyUserId)
        .query(`
      INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[app_users] (
        username,
        password_hash,
        role_id,
        legacy_user_id,
        is_active
      )
      OUTPUT
        inserted.user_id AS userId
      VALUES (@username, @passwordHash, @roleId, @legacyUserId, 1);
    `);
    return getAppUserRowById(result.recordset[0].userId);
}
async function loginWithProvisioning(username, password) {
    const utilityUser = await authenticateUtilityUser(username, password);
    const userRow = utilityUser ?? (await provisionLegacyUser(username, password));
    if (!userRow) {
        return null;
    }
    const pool = await (0, sql_server_js_1.getSqlPool)();
    await pool
        .request()
        .input('userId', sql_server_js_1.sql.BigInt, userRow.userId)
        .query(`
      UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[app_users]
      SET
        last_login_at = SYSUTCDATETIME(),
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @userId
    `);
    return getAppUserById(userRow.userId);
}
async function getAppUserById(userId) {
    const userRow = await getAppUserRowById(userId);
    if (!userRow) {
        throw (0, http_errors_js_1.notFound)('User not found');
    }
    if (!userRow.isActive) {
        throw (0, http_errors_js_1.badRequest)('Account is deactivated');
    }
    return mapAuthenticatedUser(userRow);
}
async function getAllUsers(query) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const [utilityResult, legacyResult] = await Promise.all([
        pool
            .request()
            .input('offset', sql_server_js_1.sql.Int, offset)
            .input('limit', sql_server_js_1.sql.Int, limit)
            .query(`
        SELECT
          u.user_id AS userId,
          u.username AS username,
          u.password_hash AS passwordHash,
          u.role_id AS roleId,
          r.role_name AS roleName,
          u.legacy_user_id AS legacyUserId,
          u.is_active AS isActive,
          u.last_login_at AS lastLoginAt,
          u.created_at AS createdAt,
          u.updated_at AS updatedAt,
          COUNT(*) OVER() AS totalRows
        FROM [${env_js_1.env.UTILITY_SCHEMA}].[app_users] u
        INNER JOIN [${env_js_1.env.UTILITY_SCHEMA}].[app_roles] r
          ON r.role_id = u.role_id
        ORDER BY u.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `),
        pool.request().query(`
      SELECT
        ua.user_id AS id,
        NULLIF(LTRIM(RTRIM(
          ISNULL(ua.first_name, '') +
          CASE WHEN ISNULL(ua.last_name, '') <> '' THEN ' ' + ua.last_name ELSE '' END
        )), '') AS fullName,
        'USER_ACCESS' AS source,
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
          ) THEN CAST(1 AS BIT)
          ELSE CAST(0 AS BIT)
        END AS isSuperUser,
        au.user_id AS linkedUtilityUserId,
        au.username AS linkedUtilityUsername
      FROM user_access ua
      LEFT JOIN [${env_js_1.env.UTILITY_SCHEMA}].[app_users] au
        ON au.legacy_user_id = ua.user_id
      UNION ALL
      SELECT
        u.cashierid AS id,
        NULLIF(LTRIM(RTRIM(u.cashier_name)), '') AS fullName,
        'USER_TABLE' AS source,
        CASE
          WHEN ISNUMERIC(u.user_level) = 1 THEN CAST(u.user_level AS INT)
          ELSE NULL
        END AS accessType,
        CAST(0 AS BIT) AS adjustmentPageAccess,
        CAST(0 AS BIT) AS adjustmentEditAccess,
        CAST(0 AS BIT) AS adjustmentDeleteAccess,
        CAST(0 AS BIT) AS isSuperUser,
        NULL AS linkedUtilityUserId,
        NULL AS linkedUtilityUsername
      FROM [user] u
      WHERE NOT EXISTS (
        SELECT 1
        FROM user_access ua
        WHERE ua.user_id = u.cashierid
      )
      ORDER BY source ASC, id ASC
    `),
    ]);
    const rows = utilityResult.recordset;
    const total = rows[0]?.totalRows ?? 0;
    return {
        utility: {
            data: rows.map((row) => mapUserSummary(row)),
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        legacy: legacyResult.recordset.map((row) => mapLegacyUser(row)),
    };
}
async function getUserById(id) {
    const user = await getAppUserRowById(Number(id));
    if (!user) {
        throw (0, http_errors_js_1.notFound)('User not found');
    }
    const legacyPermissions = user.legacyUserId
        ? await (0, permissions_repository_js_1.getLegacyPermissionRecord)(user.legacyUserId)
        : null;
    return mapUserSummary(user, (0, permissions_service_js_1.buildEffectivePermissions)(user.roleName, legacyPermissions, user.username));
}
async function createUser(input, performedBy) {
    const existing = await getAppUserRowByUsername(input.username);
    if (existing) {
        throw (0, http_errors_js_1.conflict)('Username already exists');
    }
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const passwordHash = await (0, password_js_1.hashPassword)(input.password);
    const result = await pool
        .request()
        .input('username', sql_server_js_1.sql.NVarChar, input.username.trim())
        .input('passwordHash', sql_server_js_1.sql.NVarChar, passwordHash)
        .input('roleId', sql_server_js_1.sql.Int, input.roleId)
        .input('legacyUserId', sql_server_js_1.sql.NVarChar, input.legacyUserId ?? null)
        .query(`
      INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[app_users] (
        username,
        password_hash,
        role_id,
        legacy_user_id,
        is_active
      )
      OUTPUT inserted.user_id AS userId
      VALUES (@username, @passwordHash, @roleId, @legacyUserId, 1)
    `);
    const created = await getUserById(String(result.recordset[0].userId));
    await (0, audit_js_1.recordAuditEvent)(pool, {
        eventType: 'USER_CREATED',
        entityType: 'APP_USER',
        entityId: created.id,
        actorUserId: performedBy.id,
        actorUsername: performedBy.username,
        details: {
            username: created.username,
            role: created.role.name,
            legacyUserId: created.legacyUserId,
        },
    });
    return created;
}
async function updateUser(id, input, performedBy) {
    const userId = Number(id);
    const current = await getUserById(id);
    const pool = await (0, sql_server_js_1.getSqlPool)();
    await pool
        .request()
        .input('userId', sql_server_js_1.sql.BigInt, userId)
        .input('roleId', sql_server_js_1.sql.Int, input.roleId ?? current.role.id)
        .input('isActive', sql_server_js_1.sql.Bit, input.isActive ?? current.isActive)
        .input('legacyUserId', sql_server_js_1.sql.NVarChar, input.legacyUserId ?? current.legacyUserId ?? null)
        .query(`
      UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[app_users]
      SET
        role_id = @roleId,
        is_active = @isActive,
        legacy_user_id = @legacyUserId,
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @userId
    `);
    const updated = await getUserById(id);
    await (0, audit_js_1.recordAuditEvent)(pool, {
        eventType: 'USER_UPDATED',
        entityType: 'APP_USER',
        entityId: id,
        actorUserId: performedBy.id,
        actorUsername: performedBy.username,
        details: {
            before: current,
            after: updated,
        },
    });
    return updated;
}
async function resetUserPassword(id, input, performedBy) {
    const userId = Number(id);
    const user = await getUserById(id);
    const passwordHash = await (0, password_js_1.hashPassword)(input.newPassword);
    const pool = await (0, sql_server_js_1.getSqlPool)();
    await pool
        .request()
        .input('userId', sql_server_js_1.sql.BigInt, userId)
        .input('passwordHash', sql_server_js_1.sql.NVarChar, passwordHash)
        .query(`
      UPDATE [${env_js_1.env.UTILITY_SCHEMA}].[app_users]
      SET
        password_hash = @passwordHash,
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @userId
    `);
    await (0, audit_js_1.recordAuditEvent)(pool, {
        eventType: 'PASSWORD_RESET',
        entityType: 'APP_USER',
        entityId: id,
        actorUserId: performedBy.id,
        actorUsername: performedBy.username,
        details: {
            username: user.username,
        },
    });
}
async function getAllRoles() {
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const result = await pool.request().query(`
    SELECT role_id AS id, role_name AS name
    FROM [${env_js_1.env.UTILITY_SCHEMA}].[app_roles]
    ORDER BY role_id ASC
  `);
    return result.recordset;
}
