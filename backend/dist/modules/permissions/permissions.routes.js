"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionsRoutes = permissionsRoutes;
const auth_middleware_js_1 = require("../../middleware/auth.middleware.js");
const role_middleware_js_1 = require("../../middleware/role.middleware.js");
const permissions_controller_js_1 = require("./permissions.controller.js");
async function permissionsRoutes(fastify) {
    fastify.get('/', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('permissionsRead')] }, permissions_controller_js_1.handleGetAllPermissions);
    fastify.patch('/:roleId', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('permissionsWrite')] }, permissions_controller_js_1.handleUpdateRolePermissions);
}
