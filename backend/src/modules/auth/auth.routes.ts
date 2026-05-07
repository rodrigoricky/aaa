import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware.js';
import { handleLogin, handleLogout, handleProfile } from './auth.controller.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/login', handleLogin);
  fastify.post('/logout', { preHandler: [authenticate] }, handleLogout);
  fastify.get('/profile', { preHandler: [authenticate] }, handleProfile);
}
