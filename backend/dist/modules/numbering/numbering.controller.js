"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetQaNumberingSettings = handleGetQaNumberingSettings;
exports.handleUpdateQaNumberingSettings = handleUpdateQaNumberingSettings;
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const api_response_js_1 = require("../../shared/http/api-response.js");
const numbering_service_js_1 = require("./numbering.service.js");
const numbering_schema_js_1 = require("./numbering.schema.js");
async function handleGetQaNumberingSettings(_request, reply) {
    const result = await (0, numbering_service_js_1.getQaNumberingSettings)();
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleUpdateQaNumberingSettings(request, reply) {
    const parsed = numbering_schema_js_1.updateQaNumberingSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
        throw (0, http_errors_js_1.badRequest)('Validation error', parsed.error.flatten().fieldErrors);
    }
    const result = await (0, numbering_service_js_1.updateQaNumberingSettings)(parsed.data);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
