"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRoutes = usersRoutes;
const auth_middleware_js_1 = require("../../middleware/auth.middleware.js");
const role_middleware_js_1 = require("../../middleware/role.middleware.js");
const users_controller_js_1 = require("./users.controller.js");
async function usersRoutes(fastify) {
    const canRead = [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('usersRead')];
    const canWrite = [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('usersWrite')];
    fastify.get('/', { preHandler: canRead }, users_controller_js_1.handleGetUsers);
    fastify.get('/roles', { preHandler: canRead }, users_controller_js_1.handleGetRoles);
    fastify.get('/:id', { preHandler: canRead }, users_controller_js_1.handleGetUser);
    fastify.post('/', { preHandler: canWrite }, users_controller_js_1.handleCreateUser);
    fastify.patch('/:id', { preHandler: canWrite }, users_controller_js_1.handleUpdateUser);
    fastify.post('/:id/reset-password', { preHandler: canWrite }, users_controller_js_1.handleResetPassword);
}
