import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireRoles } from '../../middleware/role.middleware.js';
import {
  handleGetQaNumberingSettings,
  handleUpdateQaNumberingSettings,
} from './numbering.controller.js';

export async function numberingRoutes(fastify: FastifyInstance): Promise<void> {
  const adminSettings = [authenticate, requireRoles('Admin', 'Supervisor')];

  fastify.get('/qa', { preHandler: adminSettings }, handleGetQaNumberingSettings);
  fastify.put('/qa', { preHandler: adminSettings }, handleUpdateQaNumberingSettings);
}