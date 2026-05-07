import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/role.middleware.js';
import {
  handleCreateItem,
  handleDeleteItem,
  handleGetCategories,
  handleGetItem,
  handleGetItems,
  handleUpdateItem,
} from './items.controller.js';

type IdParam = { Params: { id: string } };

export async function itemsRoutes(fastify: FastifyInstance): Promise<void> {
  const canRead = [authenticate, requirePermission('inventoryRead')];
  const canWrite = [authenticate, requirePermission('inventoryWrite')];

  fastify.get('/', { preHandler: canRead }, handleGetItems);
  fastify.get('/categories', { preHandler: canRead }, handleGetCategories);
  fastify.get<IdParam>('/:id', { preHandler: canRead }, handleGetItem);
  fastify.post('/', { preHandler: canWrite }, handleCreateItem);
  fastify.patch<IdParam>('/:id', { preHandler: canWrite }, handleUpdateItem);
  fastify.delete<IdParam>('/:id', { preHandler: canWrite }, handleDeleteItem);
}
