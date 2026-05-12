"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const env_js_1 = require("./config/env.js");
const sql_server_js_1 = require("./shared/database/sql-server.js");
const app_error_js_1 = require("./shared/errors/app-error.js");
const api_response_js_1 = require("./shared/http/api-response.js");
const audit_routes_js_1 = require("./modules/audit/audit.routes.js");
const auth_routes_js_1 = require("./modules/auth/auth.routes.js");
const dashboard_routes_js_1 = require("./modules/dashboard/dashboard.routes.js");
const items_routes_js_1 = require("./modules/items/items.routes.js");
const numbering_routes_js_1 = require("./modules/numbering/numbering.routes.js");
const permissions_routes_js_1 = require("./modules/permissions/permissions.routes.js");
const quantity_adjustments_routes_js_1 = require("./modules/quantity-adjustments/quantity-adjustments.routes.js");
const users_routes_js_1 = require("./modules/users/users.routes.js");
async function buildApp() {
    const fastify = (0, fastify_1.default)({
        logger: env_js_1.env.NODE_ENV === 'development'
            ? {
                level: 'info',
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'SYS:standard',
                        ignore: 'pid,hostname',
                    },
                },
            }
            : { level: 'warn' },
        trustProxy: true,
        bodyLimit: 1_048_576,
    });
    await fastify.register(helmet_1.default, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
            },
        },
        frameguard: { action: 'deny' },
        noSniff: true,
        hidePoweredBy: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    });
    await fastify.register(cors_1.default, {
        origin: (origin, callback) => {
            if (!origin || origin === env_js_1.env.FRONTEND_URL) {
                return callback(null, true);
            }
            if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(origin)) {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'), false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        maxAge: 86_400,
    });
    await fastify.register(cookie_1.default, {
        secret: env_js_1.env.JWT_SECRET,
    });
    await fastify.register(rate_limit_1.default, {
        max: 300,
        timeWindow: '1 minute',
        skipOnError: true,
    });
    fastify.get('/health', async (_request, reply) => {
        const pool = await (0, sql_server_js_1.getSqlPool)();
        const dbCheck = await pool.request().query('SELECT 1 AS ok');
        return (0, api_response_js_1.sendSuccess)(reply, {
            status: 'ok',
            database: dbCheck.recordset[0]?.ok === 1 ? 'connected' : 'degraded',
            timestamp: new Date().toISOString(),
        });
    });
    await fastify.register(auth_routes_js_1.authRoutes, { prefix: '/api/auth' });
    await fastify.register(users_routes_js_1.usersRoutes, { prefix: '/api/users' });
    await fastify.register(items_routes_js_1.itemsRoutes, { prefix: '/api/inventory' });
    await fastify.register(audit_routes_js_1.auditRoutes, { prefix: '/api/audit-logs' });
    await fastify.register(dashboard_routes_js_1.dashboardRoutes, { prefix: '/api/dashboard' });
    await fastify.register(numbering_routes_js_1.numberingRoutes, { prefix: '/api/numbering' });
    await fastify.register(quantity_adjustments_routes_js_1.quantityAdjustmentRoutes, { prefix: '/api/quantity-adjustments' });
    await fastify.register(permissions_routes_js_1.permissionsRoutes, { prefix: '/api/permissions' });
    fastify.setErrorHandler((error, request, reply) => {
        if ((0, app_error_js_1.isAppError)(error)) {
            const itemDetails = error.details &&
                typeof error.details === 'object' &&
                !Array.isArray(error.details) &&
                'items' in error.details
                ? { items: error.details.items }
                : {};
            return reply.status(error.statusCode).send({
                success: false,
                data: null,
                error: {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                },
                message: error.message,
                ...itemDetails,
            });
        }
        fastify.log.error({ err: error, url: request.url }, 'Unhandled server error');
        return reply.status(500).send({
            success: false,
            data: null,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: env_js_1.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
            },
            message: env_js_1.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        });
    });
    fastify.setNotFoundHandler((_request, reply) => {
        return reply.status(404).send({
            success: false,
            data: null,
            error: {
                code: 'NOT_FOUND',
                message: 'Route not found',
            },
            message: 'Route not found',
        });
    });
    return fastify;
}
