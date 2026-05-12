"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRoutes = dashboardRoutes;
const auth_middleware_js_1 = require("../../middleware/auth.middleware.js");
const role_middleware_js_1 = require("../../middleware/role.middleware.js");
const dashboard_controller_js_1 = require("./dashboard.controller.js");
async function dashboardRoutes(fastify) {
    const canRead = [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('dashboardRead')];
    fastify.get('/stats', { preHandler: canRead }, dashboard_controller_js_1.handleGetStats);
    fastify.get('/sales-trend', { preHandler: canRead }, dashboard_controller_js_1.handleGetSalesTrend);
    fastify.get('/recent-transactions', { preHandler: canRead }, dashboard_controller_js_1.handleGetRecentTransactions);
}
