import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requirePermission, requireRoles } from '../../middleware/role.middleware.js';
import {
  handleCreateQuantityAdjustment,
  handleGetQuantityAdjustmentMeta,
  handleGetPrintableQuantityAdjustment,
  handleGetQuantityAdjustment,
  handleListQuantityAdjustments,
  handlePostQuantityAdjustment,
  handleRequestQuantityAdjustmentCancellation,
  handleUpdateQuantityAdjustment,
} from './quantity-adjustments.controller.js';

type IdParam = { Params: { id: string } };

export async function quantityAdjustmentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/',
    { preHandler: [authenticate, requirePermission('adjustmentPageAccess')] },
    handleListQuantityAdjustments
  );
  fastify.get(
    '/meta',
    { preHandler: [authenticate, requirePermission('adjustmentPageAccess')] },
    handleGetQuantityAdjustmentMeta
  );
  fastify.post(
    '/',
    { preHandler: [authenticate, requirePermission('adjustmentSave')] },
    handleCreateQuantityAdjustment
  );
  fastify.get<IdParam>(
    '/:id',
    { preHandler: [authenticate, requirePermission('adjustmentPageAccess')] },
    handleGetQuantityAdjustment
  );
  fastify.patch<IdParam>(
    '/:id',
    { preHandler: [authenticate, requirePermission('adjustmentEdit')] },
    handleUpdateQuantityAdjustment
  );
  fastify.post<IdParam>(
    '/:id/cancel',
    { preHandler: [authenticate, requireRoles('Admin', 'Supervisor', 'Encoder')] },
    handleRequestQuantityAdjustmentCancellation
  );
  fastify.post<IdParam>(
    '/:id/post',
    { preHandler: [authenticate, requirePermission('adjustmentPost')] },
    handlePostQuantityAdjustment
  );
  fastify.get<IdParam>(
    '/:id/print',
    { preHandler: [authenticate, requirePermission('adjustmentPrint')] },
    handleGetPrintableQuantityAdjustment
  );
}
