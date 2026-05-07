import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../shared/errors/http-errors.js';
import { verifyToken } from '../shared/utils/jwt.js';
import { getAppUserById } from '../modules/users/users.service.js';

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = request.cookies?.['gnp_token'];
  if (!token) {
    throw unauthorized();
  }

  const payload = verifyToken(token);
  request.user = await getAppUserById(payload.userId);
}
