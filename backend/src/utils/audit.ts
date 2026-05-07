import type { ConnectionPool, Transaction } from 'mssql';
import { env } from '../config/env.js';
import { sql } from '../shared/database/sql-server.js';

interface AuditEventInput {
  eventType: string;
  entityType: string;
  entityId?: string | number | null;
  actorUserId?: number | null;
  actorUsername?: string | null;
  details?: unknown;
}

export async function recordAuditEvent(
  executor: ConnectionPool | Transaction,
  input: AuditEventInput
) {
  const request = executor.request();
  request.input('eventType', sql.NVarChar, input.eventType);
  request.input('entityType', sql.NVarChar, input.entityType);
  request.input('entityId', sql.NVarChar, input.entityId != null ? String(input.entityId) : null);
  request.input('actorUserId', sql.BigInt, input.actorUserId ?? null);
  request.input('actorUsername', sql.NVarChar, input.actorUsername ?? null);
  request.input('details', sql.NVarChar(sql.MAX), input.details ? JSON.stringify(input.details) : null);

  await request.query(`
    INSERT INTO [${env.UTILITY_SCHEMA}].[audit_log] (
      event_type,
      entity_type,
      entity_id,
      actor_user_id,
      actor_username,
      details
    )
    VALUES (
      @eventType,
      @entityType,
      @entityId,
      @actorUserId,
      @actorUsername,
      @details
    );
  `);
}
