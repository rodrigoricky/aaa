"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quantityAdjustmentRoutes = quantityAdjustmentRoutes;
const auth_middleware_js_1 = require("../../middleware/auth.middleware.js");
const role_middleware_js_1 = require("../../middleware/role.middleware.js");
const quantity_adjustments_controller_js_1 = require("./quantity-adjustments.controller.js");
async function quantityAdjustmentRoutes(fastify) {
    fastify.get('/', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('adjustmentPageAccess')] }, quantity_adjustments_controller_js_1.handleListQuantityAdjustments);
    fastify.get('/meta', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('adjustmentPageAccess')] }, quantity_adjustments_controller_js_1.handleGetQuantityAdjustmentMeta);
    fastify.post('/', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('adjustmentSave')] }, quantity_adjustments_controller_js_1.handleCreateQuantityAdjustment);
    fastify.get('/:id', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('adjustmentPageAccess')] }, quantity_adjustments_controller_js_1.handleGetQuantityAdjustment);
    fastify.patch('/:id', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('adjustmentEdit')] }, quantity_adjustments_controller_js_1.handleUpdateQuantityAdjustment);
    fastify.post('/:id/cancel', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requireRoles)('Admin', 'Supervisor', 'Encoder')] }, quantity_adjustments_controller_js_1.handleRequestQuantityAdjustmentCancellation);
    fastify.post('/:id/post', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('adjustmentPost')] }, quantity_adjustments_controller_js_1.handlePostQuantityAdjustment);
    fastify.get('/:id/print', { preHandler: [auth_middleware_js_1.authenticate, (0, role_middleware_js_1.requirePermission)('adjustmentPrint')] }, quantity_adjustments_controller_js_1.handleGetPrintableQuantityAdjustment);
}
