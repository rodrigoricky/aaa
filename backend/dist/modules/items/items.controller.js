"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetItems = handleGetItems;
exports.handleGetItem = handleGetItem;
exports.handleGetCategories = handleGetCategories;
exports.handleCreateItem = handleCreateItem;
exports.handleUpdateItem = handleUpdateItem;
exports.handleDeleteItem = handleDeleteItem;
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const api_response_js_1 = require("../../shared/http/api-response.js");
const items_schema_js_1 = require("./items.schema.js");
const items_service_js_1 = require("./items.service.js");
async function handleGetItems(request, reply) {
    const parsed = items_schema_js_1.itemQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        throw (0, http_errors_js_1.badRequest)('Invalid query', parsed.error.flatten().fieldErrors);
    }
    const result = await (0, items_service_js_1.getItems)(parsed.data);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleGetItem(request, reply) {
    const result = await (0, items_service_js_1.getItemById)(request.params.id);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleGetCategories(_request, reply) {
    const result = await (0, items_service_js_1.getCategories)();
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleCreateItem() {
    await (0, items_service_js_1.rejectInventoryWrite)();
}
async function handleUpdateItem() {
    await (0, items_service_js_1.rejectInventoryWrite)();
}
async function handleDeleteItem() {
    await (0, items_service_js_1.rejectInventoryWrite)();
}
