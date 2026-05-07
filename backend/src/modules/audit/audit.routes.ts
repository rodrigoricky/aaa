import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/role.middleware.js';
import { handleGetAuditLogs } from './audit.controller.js';

export async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', { preHandler: [authenticate, requirePermission('auditRead')] }, handleGetAuditLogs);
}
