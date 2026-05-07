import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/role.middleware.js';
import {
  handleGetRecentTransactions,
  handleGetSalesTrend,
  handleGetStats,
} from './dashboard.controller.js';

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  const canRead = [authenticate, requirePermission('dashboardRead')];

  fastify.get('/stats', { preHandler: canRead }, handleGetStats);
  fastify.get('/sales-trend', { preHandler: canRead }, handleGetSalesTrend);
  fastify.get('/recent-transactions', { preHandler: canRead }, handleGetRecentTransactions);
}
