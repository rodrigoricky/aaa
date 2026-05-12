"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.itemsRoutes = itemsRoutes;
const auth_middleware_js_1 = require("../../middleware/auth.middleware.js");
const role_middleware_js_1 = require("../../middleware/role.middleware.js");
const items_controller_js_1 = require("./items.controller.js");
async function itemsRoutes(fastify) {
    const canRead = [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('inventoryRead')];
    const canWrite = [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('inventoryWrite')];
    fastify.get('/', { preHandler: canRead }, items_controller_js_1.handleGetItems);
    fastify.get('/categories', { preHandler: canRead }, items_controller_js_1.handleGetCategories);
    fastify.get('/:id', { preHandler: canRead }, items_controller_js_1.handleGetItem);
    fastify.post('/', { preHandler: canWrite }, items_controller_js_1.handleCreateItem);
    fastify.patch('/:id', { preHandler: canWrite }, items_controller_js_1.handleUpdateItem);
    fastify.delete('/:id', { preHandler: canWrite }, items_controller_js_1.handleDeleteItem);
}
