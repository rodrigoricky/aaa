"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAuditEvent = recordAuditEvent;
const env_js_1 = require("../config/env.js");
const sql_server_js_1 = require("../shared/database/sql-server.js");
async function recordAuditEvent(executor, input) {
    const request = executor.request();
    request.input('eventType', sql_server_js_1.sql.NVarChar, input.eventType);
    request.input('entityType', sql_server_js_1.sql.NVarChar, input.entityType);
    request.input('entityId', sql_server_js_1.sql.NVarChar, input.entityId != null ? String(input.entityId) : null);
    request.input('actorUserId', sql_server_js_1.sql.BigInt, input.actorUserId ?? null);
    request.input('actorUsername', sql_server_js_1.sql.NVarChar, input.actorUsername ?? null);
    request.input('details', sql_server_js_1.sql.NVarChar(sql_server_js_1.sql.MAX), input.details ? JSON.stringify(input.details) : null);
    await request.query(`
    INSERT INTO [${env_js_1.env.UTILITY_SCHEMA}].[audit_log] (
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
