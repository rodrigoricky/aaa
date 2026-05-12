"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLogin = handleLogin;
exports.handleLogout = handleLogout;
exports.handleProfile = handleProfile;
const env_js_1 = require("../../config/env.js");
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const api_response_js_1 = require("../../shared/http/api-response.js");
const auth_service_js_1 = require("./auth.service.js");
const auth_schema_js_1 = require("./auth.schema.js");
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: env_js_1.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60,
};
async function handleLogin(request, reply) {
    const parsed = auth_schema_js_1.loginSchema.safeParse(request.body);
    if (!parsed.success) {
        throw (0, http_errors_js_1.badRequest)('Validation error', parsed.error.flatten().fieldErrors);
    }
    const result = await (0, auth_service_js_1.loginUser)(parsed.data);
    reply.setCookie('gnp_token', result.token, COOKIE_OPTIONS);
    return (0, api_response_js_1.sendSuccess)(reply, { user: result.user });
}
async function handleLogout(_request, reply) {
    reply.clearCookie('gnp_token', { path: '/' });
    return (0, api_response_js_1.sendMessage)(reply, 'Logged out');
}
async function handleProfile(request, reply) {
    const profile = await (0, auth_service_js_1.getProfile)(request.user.id);
    return (0, api_response_js_1.sendSuccess)(reply, profile);
}
