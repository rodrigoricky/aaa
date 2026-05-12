"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRoutes = auditRoutes;
const auth_middleware_js_1 = require("../../middleware/auth.middleware.js");
const role_middleware_js_1 = require("../../middleware/role.middleware.js");
const audit_controller_js_1 = require("./audit.controller.js");
async function auditRoutes(fastify) {
    fastify.get('/', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('auditRead')] }, audit_controller_js_1.handleGetAuditLogs);
}
