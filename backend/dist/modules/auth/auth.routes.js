"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const auth_middleware_js_1 = require("../../middleware/auth.middleware.js");
const auth_controller_js_1 = require("./auth.controller.js");
async function authRoutes(fastify) {
    fastify.post('/login', auth_controller_js_1.handleLogin);
    fastify.post('/logout', { preHandler: [auth_middleware_js_1.authenticate] }, auth_controller_js_1.handleLogout);
    fastify.get('/profile', { preHandler: [auth_middleware_js_1.authenticate] }, auth_controller_js_1.handleProfile);
}
