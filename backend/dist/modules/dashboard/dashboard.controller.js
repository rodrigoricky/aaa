"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetStats = handleGetStats;
exports.handleGetSalesTrend = handleGetSalesTrend;
exports.handleGetRecentTransactions = handleGetRecentTransactions;
const api_response_js_1 = require("../../shared/http/api-response.js");
const dashboard_service_js_1 = require("./dashboard.service.js");
async function handleGetStats(_request, reply) {
    const result = await (0, dashboard_service_js_1.getDashboardStats)();
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleGetSalesTrend(_request, reply) {
    const result = await (0, dashboard_service_js_1.getSalesTrend)();
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleGetRecentTransactions(_request, reply) {
    const result = await (0, dashboard_service_js_1.getRecentTransactions)();
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
