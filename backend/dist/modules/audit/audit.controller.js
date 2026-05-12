"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetAuditLogs = handleGetAuditLogs;
const api_response_js_1 = require("../../shared/http/api-response.js");
const audit_service_js_1 = require("./audit.service.js");
async function handleGetAuditLogs(request, reply) {
    const query = request.query;
    const result = await (0, audit_service_js_1.getAuditLogs)({
        page: query.page ? Number(query.page) : 1,
        limit: query.limit ? Number(query.limit) : 20,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        actor: query.actor,
        action: query.action,
    });
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
