import api from './api';

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorUsername: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogsResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogFilters {
  dateFrom?: string;
  dateTo?: string;
  actor?: string;
  action?: string;
}

export async function getAuditLogs(
  page = 1,
  limit = 20,
  filters?: AuditLogFilters
): Promise<AuditLogsResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.actor) params.set('actor', filters.actor);
  if (filters?.action) params.set('action', filters.action);
  const res = await api.get<{ success: boolean; data: AuditLogsResponse }>(`/audit-logs?${params}`);
  return res.data.data;
}
