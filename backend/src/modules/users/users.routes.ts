import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/role.middleware.js';
import {
  handleCreateUser,
  handleGetRoles,
  handleGetUser,
  handleGetUsers,
  handleResetPassword,
  handleUpdateUser,
} from './users.controller.js';

type IdParam = { Params: { id: string } };

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  const canRead = [authenticate, requirePermission('usersRead')];
  const canWrite = [authenticate, requirePermission('usersWrite')];

  fastify.get('/', { preHandler: canRead }, handleGetUsers);
  fastify.get('/roles', { preHandler: canRead }, handleGetRoles);
  fastify.get<IdParam>('/:id', { preHandler: canRead }, handleGetUser);
  fastify.post('/', { preHandler: canWrite }, handleCreateUser);
  fastify.patch<IdParam>('/:id', { preHandler: canWrite }, handleUpdateUser);
  fastify.post<IdParam>('/:id/reset-password', { preHandler: canWrite }, handleResetPassword);
}
