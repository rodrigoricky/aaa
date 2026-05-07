import { env } from '../../config/env.js';
import { getSqlPool, sql } from '../../shared/database/sql-server.js';
import { badRequest, conflict, notFound, unauthorized } from '../../shared/errors/http-errors.js';
import type {
  AuthenticatedUser,
  PaginatedResult,
  PaginationQuery,
  PermissionSnapshot,
  RoleName,
} from '../../shared/types/index.js';
import { comparePassword, hashPassword } from '../../shared/utils/password.js';
import { toIsoString } from '../../shared/utils/value.js';
import { recordAuditEvent } from '../../utils/audit.js';
import {
  buildEffectivePermissions,
  deriveRoleFromLegacyAccess,
  getRolePermissions,
} from '../permissions/permissions.service.js';
import {
  getLegacyPermissionRecord,
  getRolePermissionOverrides,
  verifyLegacyCredentials,
} from '../permissions/permissions.repository.js';
import type {
  CreateUserInput,
  ResetPasswordInput,
  UpdateUserInput,
} from './users.schema.js';

interface AppUserRow {
  userId: number;
  username: string;
  passwordHash: string;
  roleId: number;
  roleName: RoleName;
  legacyUserId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LegacyUserRow {
  id: string;
  fullName: string | null;
  source: 'USER_ACCESS' | 'USER_TABLE';
  accessType: number | null;
  adjustmentPageAccess: boolean;
  adjustmentEditAccess: boolean;
  adjustmentDeleteAccess: boolean;
  isSuperUser: boolean;
  linkedUtilityUserId: number | null;
  linkedUtilityUsername: string | null;
}

function mapUserSummary(row: AppUserRow, permissions?: PermissionSnapshot) {
  return {
    id: String(row.userId),
    username: row.username,
    isActive: row.isActive,
    lastLogin: toIsoString(row.lastLoginAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    legacyUserId: row.legacyUserId,
    role: {
      id: row.roleId,
      name: row.roleName,
    },
    permissions: permissions ?? getRolePermissions(row.roleName),
  };
}

function mapLegacyUser(row: LegacyUserRow) {
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

async function mapAuthenticatedUser(row: AppUserRow): Promise<AuthenticatedUser> {
  const [legacyPermissions, roleOverrides] = await Promise.all([
    row.legacyUserId ? getLegacyPermissionRecord(row.legacyUserId) : Promise.resolve(null),
    getRolePermissionOverrides(row.roleId),
  ]);

  return {
    id: row.userId,
    username: row.username,
    role: row.roleName,
    roleId: row.roleId,
    isActive: row.isActive,
    legacyUserId: row.legacyUserId,
    permissions: buildEffectivePermissions(row.roleName, legacyPermissions, row.username, roleOverrides),
  };
}

async function getAppUserRowByUsername(username: string): Promise<AppUserRow | null> {
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .input('username', sql.NVarChar, username.trim())
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
      FROM [${env.UTILITY_SCHEMA}].[app_users] u
      INNER JOIN [${env.UTILITY_SCHEMA}].[app_roles] r
        ON r.role_id = u.role_id
      WHERE u.username = @username
    `);

  return result.recordset[0] ?? null;
}

async function getAppUserRowById(userId: number): Promise<AppUserRow | null> {
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .input('userId', sql.BigInt, userId)
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
      FROM [${env.UTILITY_SCHEMA}].[app_users] u
      INNER JOIN [${env.UTILITY_SCHEMA}].[app_roles] r
        ON r.role_id = u.role_id
      WHERE u.user_id = @userId
    `);

  return result.recordset[0] ?? null;
}

export async function authenticateUtilityUser(username: string, password: string) {
  const userRow = await getAppUserRowByUsername(username);

  if (!userRow) {
    return null;
  }

  if (!userRow.isActive) {
    throw badRequest('Account is deactivated');
  }

  const isValid = await comparePassword(password, userRow.passwordHash);
  if (!isValid) {
    throw unauthorized('Invalid credentials');
  }

  return userRow;
}

async function provisionLegacyUser(username: string, password: string) {
  if (!env.LEGACY_AUTH_PROVISIONING_ENABLED) {
    return null;
  }

  const legacyRecord = await verifyLegacyCredentials(username, password);
  if (!legacyRecord) {
    return null;
  }

  const existing = await getAppUserRowByUsername(username);
  if (existing) {
    return existing;
  }

  const pool = await getSqlPool();
  const passwordHash = await hashPassword(password);
  const role = deriveRoleFromLegacyAccess(legacyRecord);
  const roleIdMap: Record<RoleName, number> = {
    Admin: 1,
    Supervisor: 2,
    Encoder: 3,
    'POS User': 4,
    'Security Level 2': 5,
  };

  const result = await pool
    .request()
    .input('username', sql.NVarChar, username.trim())
    .input('passwordHash', sql.NVarChar, passwordHash)
    .input('roleId', sql.Int, roleIdMap[role])
    .input('legacyUserId', sql.NVarChar, legacyRecord.legacyUserId)
    .query(`
      INSERT INTO [${env.UTILITY_SCHEMA}].[app_users] (
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

export async function loginWithProvisioning(username: string, password: string) {
  const utilityUser = await authenticateUtilityUser(username, password);
  const userRow = utilityUser ?? (await provisionLegacyUser(username, password));

  if (!userRow) {
    return null;
  }

  const pool = await getSqlPool();
  await pool
    .request()
    .input('userId', sql.BigInt, userRow.userId)
    .query(`
      UPDATE [${env.UTILITY_SCHEMA}].[app_users]
      SET
        last_login_at = SYSUTCDATETIME(),
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @userId
    `);

  return getAppUserById(userRow.userId);
}

export async function getAppUserById(userId: number): Promise<AuthenticatedUser> {
  const userRow = await getAppUserRowById(userId);
  if (!userRow) {
    throw notFound('User not found');
  }

  if (!userRow.isActive) {
    throw badRequest('Account is deactivated');
  }

  return mapAuthenticatedUser(userRow);
}

export async function getAllUsers(
  query: PaginationQuery
): Promise<{
  utility: PaginatedResult<ReturnType<typeof mapUserSummary>>;
  legacy: Array<ReturnType<typeof mapLegacyUser>>;
}> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const offset = (page - 1) * limit;

  const pool = await getSqlPool();
  const [utilityResult, legacyResult] = await Promise.all([
    pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
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
        FROM [${env.UTILITY_SCHEMA}].[app_users] u
        INNER JOIN [${env.UTILITY_SCHEMA}].[app_roles] r
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
      LEFT JOIN [${env.UTILITY_SCHEMA}].[app_users] au
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

  const rows = utilityResult.recordset as (AppUserRow & { totalRows?: number })[];
  const total = rows[0]?.totalRows ?? 0;

  return {
    utility: {
      data: rows.map((row) => mapUserSummary(row)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    legacy: (legacyResult.recordset as LegacyUserRow[]).map((row) => mapLegacyUser(row)),
  };
}

export async function getUserById(id: string) {
  const user = await getAppUserRowById(Number(id));
  if (!user) {
    throw notFound('User not found');
  }

  const legacyPermissions = user.legacyUserId
    ? await getLegacyPermissionRecord(user.legacyUserId)
    : null;

  return mapUserSummary(user, buildEffectivePermissions(user.roleName, legacyPermissions, user.username));
}

export async function createUser(input: CreateUserInput, performedBy: AuthenticatedUser) {
  const existing = await getAppUserRowByUsername(input.username);
  if (existing) {
    throw conflict('Username already exists');
  }

  const pool = await getSqlPool();
  const passwordHash = await hashPassword(input.password);
  const result = await pool
    .request()
    .input('username', sql.NVarChar, input.username.trim())
    .input('passwordHash', sql.NVarChar, passwordHash)
    .input('roleId', sql.Int, input.roleId)
    .input('legacyUserId', sql.NVarChar, input.legacyUserId ?? null)
    .query(`
      INSERT INTO [${env.UTILITY_SCHEMA}].[app_users] (
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
  await recordAuditEvent(pool, {
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

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  performedBy: AuthenticatedUser
) {
  const userId = Number(id);
  const current = await getUserById(id);

  const pool = await getSqlPool();
  await pool
    .request()
    .input('userId', sql.BigInt, userId)
    .input('roleId', sql.Int, input.roleId ?? current.role.id)
    .input('isActive', sql.Bit, input.isActive ?? current.isActive)
    .input('legacyUserId', sql.NVarChar, input.legacyUserId ?? current.legacyUserId ?? null)
    .query(`
      UPDATE [${env.UTILITY_SCHEMA}].[app_users]
      SET
        role_id = @roleId,
        is_active = @isActive,
        legacy_user_id = @legacyUserId,
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @userId
    `);

  const updated = await getUserById(id);
  await recordAuditEvent(pool, {
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

export async function resetUserPassword(
  id: string,
  input: ResetPasswordInput,
  performedBy: AuthenticatedUser
) {
  const userId = Number(id);
  const user = await getUserById(id);
  const passwordHash = await hashPassword(input.newPassword);
  const pool = await getSqlPool();

  await pool
    .request()
    .input('userId', sql.BigInt, userId)
    .input('passwordHash', sql.NVarChar, passwordHash)
    .query(`
      UPDATE [${env.UTILITY_SCHEMA}].[app_users]
      SET
        password_hash = @passwordHash,
        updated_at = SYSUTCDATETIME()
      WHERE user_id = @userId
    `);

  await recordAuditEvent(pool, {
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

export async function getAllRoles() {
  const pool = await getSqlPool();
  const result = await pool.request().query(`
    SELECT role_id AS id, role_name AS name
    FROM [${env.UTILITY_SCHEMA}].[app_roles]
    ORDER BY role_id ASC
  `);

  return result.recordset;
}
