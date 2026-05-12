"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.numberingRoutes = numberingRoutes;
const auth_middleware_js_1 = require("../../middleware/auth.middleware.js");
const role_middleware_js_1 = require("../../middleware/role.middleware.js");
const numbering_controller_js_1 = require("./numbering.controller.js");
async function numberingRoutes(fastify) {
    const adminSettings = [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requireRoles)('Admin')];
    fastify.get('/qa', { preHandler: adminSettings }, numbering_controller_js_1.handleGetQaNumberingSettings);
    fastify.put('/qa', { preHandler: adminSettings }, numbering_controller_js_1.handleUpdateQaNumberingSettings);
}
