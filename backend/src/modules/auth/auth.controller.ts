import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { badRequest } from '../../shared/errors/http-errors.js';
import { sendMessage, sendSuccess } from '../../shared/http/api-response.js';
import { getProfile, loginUser } from './auth.service.js';
import { loginSchema } from './auth.schema.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 8 * 60 * 60,
};

export async function handleLogin(request: FastifyRequest, reply: FastifyReply) {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    throw badRequest('Validation error', parsed.error.flatten().fieldErrors);
  }

  const result = await loginUser(parsed.data);
  reply.setCookie('gnp_token', result.token, COOKIE_OPTIONS);

  return sendSuccess(reply, { user: result.user });
}

export async function handleLogout(_request: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie('gnp_token', { path: '/' });
  return sendMessage(reply, 'Logged out');
}

export async function handleProfile(request: FastifyRequest, reply: FastifyReply) {
  const profile = await getProfile(request.user.id);
  return sendSuccess(reply, profile);
}
