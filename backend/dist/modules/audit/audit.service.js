"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditLogs = getAuditLogs;
const env_js_1 = require("../../config/env.js");
const sql_server_js_1 = require("../../shared/database/sql-server.js");
const value_js_1 = require("../../shared/utils/value.js");
async function getAuditLogs(query) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;
    const pool = await (0, sql_server_js_1.getSqlPool)();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
    const dateTo = query.dateTo ? new Date(query.dateTo) : null;
    const actor = (0, value_js_1.cleanString)(query.actor);
    const action = (0, value_js_1.cleanString)(query.action);
    const result = await pool
        .request()
        .input('offset', sql_server_js_1.sql.Int, offset)
        .input('limit', sql_server_js_1.sql.Int, limit)
        .input('dateFrom', sql_server_js_1.sql.Date, dateFrom)
        .input('dateTo', sql_server_js_1.sql.Date, dateTo)
        .input('actor', sql_server_js_1.sql.NVarChar, actor ? `%${actor}%` : null)
        .input('action', sql_server_js_1.sql.NVarChar, action || null)
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
      FROM [${env_js_1.env.UTILITY_SCHEMA}].[audit_log]
      WHERE
        (@dateFrom IS NULL OR CAST(created_at AS DATE) >= @dateFrom)
        AND (@dateTo IS NULL OR CAST(created_at AS DATE) <= @dateTo)
        AND (@actor IS NULL OR actor_username LIKE @actor)
        AND (@action IS NULL OR event_type = @action)
      ORDER BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    const rows = result.recordset;
    const total = Number(rows[0]?.totalRows ?? 0);
    return {
        data: rows.map((row) => {
            let parsedDetails = null;
            if (row.details && typeof row.details === 'string') {
                try {
                    parsedDetails = JSON.parse(row.details);
                }
                catch {
                    parsedDetails = null;
                }
            }
            return {
                id: String(row.id),
                action: (0, value_js_1.cleanString)(row.action),
                entityType: (0, value_js_1.cleanString)(row.entityType),
                entityId: (0, value_js_1.cleanString)(row.entityId),
                actorUserId: row.actorUserId != null ? String(row.actorUserId) : null,
                actorUsername: (0, value_js_1.cleanString)(row.actorUsername),
                details: parsedDetails,
                createdAt: (0, value_js_1.toIsoString)(row.createdAt),
            };
        }),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}
