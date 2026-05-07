import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendSuccess } from '../../shared/http/api-response.js';
import { getAuditLogs } from './audit.service.js';

export async function handleGetAuditLogs(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as {
    page?: string;
    limit?: string;
    dateFrom?: string;
    dateTo?: string;
    actor?: string;
    action?: string;
  };
  const result = await getAuditLogs({
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 20,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    actor: query.actor,
    action: query.action,
  });
  return sendSuccess(reply, result);
}
