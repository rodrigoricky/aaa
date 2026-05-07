import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../../shared/errors/http-errors.js';
import { sendSuccess } from '../../shared/http/api-response.js';
import { getRolePermissionDefaults } from './permissions.service.js';
import {
  getAllRolePermissions,
  upsertRolePermissions,
} from './permissions.repository.js';
import { getSqlPool, sql } from '../../shared/database/sql-server.js';
import { env } from '../../config/env.js';
import type { PermissionSnapshot, RoleName } from '../../shared/types/index.js';

export async function handleGetAllPermissions(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const dbRoles = await getAllRolePermissions();

  const data = dbRoles.map((role) => {
    const defaults = getRolePermissionDefaults(role.roleName as RoleName);
    const effective: PermissionSnapshot = { ...defaults, ...role.permissions };
    return {
      roleId: role.roleId,
      roleName: role.roleName,
      permissions: effective,
    };
  });

  return sendSuccess(reply, data);
}

const updatePermissionsBodySchema = z.object({
  permissions: z.record(z.boolean()),
});

export async function handleUpdateRolePermissions(
  request: FastifyRequest<{ Params: { roleId: string } }>,
  reply: FastifyReply
) {
  const roleId = Number(request.params.roleId);
  if (!Number.isInteger(roleId) || roleId < 1) {
    throw badRequest('Invalid role ID');
  }

  const pool = await getSqlPool();
  const roleCheck = await pool
    .request()
    .input('roleId', sql.Int, roleId)
    .query(`SELECT role_name FROM [${env.UTILITY_SCHEMA}].[app_roles] WHERE role_id = @roleId`);
  if (roleCheck.recordset.length === 0) {
    throw notFound('Role not found');
  }

  const parsed = updatePermissionsBodySchema.safeParse(request.body);
  if (!parsed.success) {
    throw badRequest('Validation error', parsed.error.flatten().fieldErrors);
  }

  await upsertRolePermissions(
    roleId,
    parsed.data.permissions as Partial<PermissionSnapshot>
  );

  const dbRoles = await getAllRolePermissions();
  const updated = dbRoles.find((r) => r.roleId === roleId);
  if (!updated) throw notFound('Role not found');

  const roleName = roleCheck.recordset[0].role_name as RoleName;
  const defaults = getRolePermissionDefaults(roleName);
  const effective: PermissionSnapshot = { ...defaults, ...updated.permissions };

  return sendSuccess(reply, { roleId, roleName, permissions: effective });
}
