import { env } from '../../config/env.js';
import { getSqlPool, sql } from '../../shared/database/sql-server.js';
import type { PaginatedResult, PaginationQuery } from '../../shared/types/index.js';
import { cleanString, toIsoString } from '../../shared/utils/value.js';

export async function getAuditLogs(
  query: PaginationQuery & {
    dateFrom?: string;
    dateTo?: string;
    actor?: string;
    action?: string;
  }
): Promise<PaginatedResult<object>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const offset = (page - 1) * limit;
  const pool = await getSqlPool();

  const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
  const dateTo = query.dateTo ? new Date(query.dateTo) : null;
  const actor = cleanString(query.actor);
  const action = cleanString(query.action);

  const result = await pool
    .request()
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .input('dateFrom', sql.Date, dateFrom)
    .input('dateTo', sql.Date, dateTo)
    .input('actor', sql.NVarChar, actor ? `%${actor}%` : null)
    .input('action', sql.NVarChar, action || null)
    .query(`
      SELECT
        audit_id       AS id,
        event_type     AS action,
        entity_type    AS entityType,
        entity_id      AS entityId,
        actor_user_id  AS actorUserId,
        actor_username AS actorUsername,
        details,
        created_at     AS createdAt,
        COUNT(*) OVER() AS totalRows
      FROM [${env.UTILITY_SCHEMA}].[audit_log]
      WHERE
        (@dateFrom IS NULL OR CAST(created_at AS DATE) >= @dateFrom)
        AND (@dateTo IS NULL OR CAST(created_at AS DATE) <= @dateTo)
        AND (@actor IS NULL OR actor_username LIKE @actor)
        AND (@action IS NULL OR event_type = @action)
      ORDER BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  const rows = result.recordset as Array<Record<string, unknown> & { totalRows?: number }>;
  const total = Number(rows[0]?.totalRows ?? 0);

  return {
    data: rows.map((row) => {
      let parsedDetails: Record<string, unknown> | null = null;
      if (row.details && typeof row.details === 'string') {
        try {
          parsedDetails = JSON.parse(row.details);
        } catch {
          parsedDetails = null;
        }
      }

      return {
        id: String(row.id),
        action: cleanString(row.action),
        entityType: cleanString(row.entityType),
        entityId: cleanString(row.entityId),
        actorUserId: row.actorUserId != null ? String(row.actorUserId) : null,
        actorUsername: cleanString(row.actorUsername),
        details: parsedDetails,
        createdAt: toIsoString(row.createdAt),
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
