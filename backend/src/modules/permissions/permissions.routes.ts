import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/role.middleware.js';
import {
  handleGetAllPermissions,
  handleUpdateRolePermissions,
} from './permissions.controller.js';

type RoleIdParam = { Params: { roleId: string } };

export async function permissionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/',
    { preHandler: [authenticate, requirePermission('permissionsRead')] },
    handleGetAllPermissions
  );
  fastify.patch<RoleIdParam>(
    '/:roleId',
    { preHandler: [authenticate, requirePermission('permissionsWrite')] },
    handleUpdateRolePermissions
  );
}
