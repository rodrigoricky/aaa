import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendSuccess } from '../../shared/http/api-response.js';
import { getDashboardStats, getRecentTransactions, getSalesTrend } from './dashboard.service.js';

export async function handleGetStats(_request: FastifyRequest, reply: FastifyReply) {
  const result = await getDashboardStats();
  return sendSuccess(reply, result);
}

export async function handleGetSalesTrend(_request: FastifyRequest, reply: FastifyReply) {
  const result = await getSalesTrend();
  return sendSuccess(reply, result);
}

export async function handleGetRecentTransactions(_request: FastifyRequest, reply: FastifyReply) {
  const result = await getRecentTransactions();
  return sendSuccess(reply, result);
}
