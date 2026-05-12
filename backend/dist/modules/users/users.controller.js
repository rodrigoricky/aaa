"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetUsers = handleGetUsers;
exports.handleGetUser = handleGetUser;
exports.handleCreateUser = handleCreateUser;
exports.handleUpdateUser = handleUpdateUser;
exports.handleResetPassword = handleResetPassword;
exports.handleGetRoles = handleGetRoles;
const api_response_js_1 = require("../../shared/http/api-response.js");
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const users_service_js_1 = require("./users.service.js");
const users_schema_js_1 = require("./users.schema.js");
async function handleGetUsers(request, reply) {
    const query = request.query;
    const result = await (0, users_service_js_1.getAllUsers)({
        page: query.page ? Number(query.page) : 1,
        limit: query.limit ? Number(query.limit) : 20,
    });
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleGetUser(request, reply) {
    const result = await (0, users_service_js_1.getUserById)(request.params.id);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleCreateUser(request, reply) {
    const parsed = users_schema_js_1.createUserSchema.safeParse(request.body);
    if (!parsed.success) {
        throw (0, http_errors_js_1.badRequest)('Validation error', parsed.error.flatten().fieldErrors);
    }
    const result = await (0, users_service_js_1.createUser)(parsed.data, request.user);
    return (0, api_response_js_1.sendSuccess)(reply, result, 201);
}
async function handleUpdateUser(request, reply) {
    const parsed = users_schema_js_1.updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
        throw (0, http_errors_js_1.badRequest)('Validation error', parsed.error.flatten().fieldErrors);
    }
    const result = await (0, users_service_js_1.updateUser)(request.params.id, parsed.data, request.user);
    return (0, api_response_js_1.sendSuccess)(reply, result);
}
async function handleResetPassword(request, reply) {
    const parsed = users_schema_js_1.resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
        throw (0, http_errors_js_1.badRequest)('Validation error', parsed.error.flatten().fieldErrors);
    }
    await (0, users_service_js_1.resetUserPassword)(request.params.id, parsed.data, request.user);
    return (0, api_response_js_1.sendMessage)(reply, 'Password reset successfully');
}
async function handleGetRoles(_request, reply) {
    const roles = await (0, users_service_js_1.getAllRoles)();
    return (0, api_response_js_1.sendSuccess)(reply, roles);
}
