"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleListQuantityAdjustments = handleListQuantityAdjustments;
exports.handleGetQuantityAdjustmentMeta = handleGetQuantityAdjustmentMeta;
exports.handleGetQuantityAdjustment = handleGetQuantityAdjustment;
exports.handleCreateQuantityAdjustment = handleCreateQuantityAdjustment;
exports.handleUpdateQuantityAdjustment = handleUpdateQuantityAdjustment;
exports.handlePostQuantityAdjustment = handlePostQuantityAdjustment;
exports.handleRequestQuantityAdjustmentCancellation = handleRequestQuantityAdjustmentCancellation;
exports.handleGetPrintableQuantityAdjustment = handleGetPrintableQuantityAdjustment;
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const api_response_js_1 = require("../../shared/http/api-response.js");
const print_service_js_1 = require("../print/print.service.js");
const quantity_adjustments_service_js_1 = require("./quantity-adjustments.service.js");
const quantity_adjustments_schema_js_1 = require("./quantity-adjustments.schema.js");
function getValidationMessage(fieldErrors, fallback) {
    for (const messages of Object.values(fieldErrors)) {
        const message = messages?.find(Boolean);
        if (message) {
            return message;
        }
    }
    return fallback;
}
async function handleListQuantityAdjustments(request, reply) {
    const parsed = quantity_adjustments_schema_js_1.listQuantityAdjustmentsSchema.safeParse(request.query);
    if (!parsed.success) {
        throw (0, http_errors_js_1.badRequest)('Invalid query', parsed.error.flatten().fieldErrors);
    }
    const result = await (0, quantity_adjustments_service_js_1.listQuantityAdjustments)(parsed.data);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleGetQuantityAdjustmentMeta(_request, reply) {
    const result = await (0, quantity_adjustments_service_js_1.getQuantityAdjustmentMeta)();
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleGetQuantityAdjustment(request, reply) {
    const result = await (0, quantity_adjustments_service_js_1.getQuantityAdjustmentById)(request.params.id);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleCreateQuantityAdjustment(request, reply) {
    const parsed = quantity_adjustments_schema_js_1.createQuantityAdjustmentSchema.safeParse(request.body);
    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        throw (0, http_errors_js_1.badRequest)(getValidationMessage(fieldErrors, 'Validation error'), fieldErrors);
    }
    const result = await (0, quantity_adjustments_service_js_1.createQuantityAdjustment)(parsed.data, request.user);
    return (0, api_response_js_1.sendSuccess)(reply, result, 201);
}
async function handleUpdateQuantityAdjustment(request, reply) {
    const parsed = quantity_adjustments_schema_js_1.updateQuantityAdjustmentSchema.safeParse(request.body);
    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        throw (0, http_errors_js_1.badRequest)(getValidationMessage(fieldErrors, 'Validation error'), fieldErrors);
    }
    const result = await (0, quantity_adjustments_service_js_1.updateQuantityAdjustment)(Number(request.params.id), parsed.data, request.user);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handlePostQuantityAdjustment(request, reply) {
    const result = await (0, quantity_adjustments_service_js_1.postQuantityAdjustment)(Number(request.params.id), request.user);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleRequestQuantityAdjustmentCancellation(request, reply) {
    const parsed = quantity_adjustments_schema_js_1.requestCancellationSchema.safeParse(request.body);
    if (!parsed.success) {
        throw (0, http_errors_js_1.badRequest)('Cancellation reason is required', parsed.error.flatten().fieldErrors);
    }
    const result = await (0, quantity_adjustments_service_js_1.requestQuantityAdjustmentCancellation)(Number(request.params.id), parsed.data.reason, request.user);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleGetPrintableQuantityAdjustment(request, reply) {
    const result = await (0, print_service_js_1.getPrintableQuantityAdjustment)(request.params.id, request.user);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
