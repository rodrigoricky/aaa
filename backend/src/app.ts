import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { getSqlPool } from './shared/database/sql-server.js';
import { isAppError } from './shared/errors/app-error.js';
import { sendSuccess } from './shared/http/api-response.js';
import { auditRoutes } from './modules/audit/audit.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { itemsRoutes } from './modules/items/items.routes.js';
import { numberingRoutes } from './modules/numbering/numbering.routes.js';
import { permissionsRoutes } from './modules/permissions/permissions.routes.js';
import { quantityAdjustmentRoutes } from './modules/quantity-adjustments/quantity-adjustments.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';

export async function buildApp() {
  const fastify = Fastify({
    logger:
      env.NODE_ENV === 'development'
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

  await fastify.register(helmet, {
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

  await fastify.register(cors, {
    origin: (origin, callback) => {
      if (!origin || origin === env.FRONTEND_URL) {
        return callback(null, true);
      }

      if (
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
          origin
        )
      ) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });

  await fastify.register(cookie, {
    secret: env.JWT_SECRET,
  });

  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    skipOnError: true,
  });

  fastify.get('/health', async (_request, reply) => {
    const pool = await getSqlPool();
    const dbCheck = await pool.request().query('SELECT 1 AS ok');

    return sendSuccess(reply, {
      status: 'ok',
      database: dbCheck.recordset[0]?.ok === 1 ? 'connected' : 'degraded',
      timestamp: new Date().toISOString(),
    });
  });

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(itemsRoutes, { prefix: '/api/inventory' });
  await fastify.register(auditRoutes, { prefix: '/api/audit-logs' });
  await fastify.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await fastify.register(numberingRoutes, { prefix: '/api/numbering' });
  await fastify.register(quantityAdjustmentRoutes, { prefix: '/api/quantity-adjustments' });
  await fastify.register(permissionsRoutes, { prefix: '/api/permissions' });

  fastify.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        success: false,
        data: null,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        message: error.message,
      });
    }

    fastify.log.error({ err: error, url: request.url }, 'Unhandled server error');

    return reply.status(500).send({
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      },
      message: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
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
