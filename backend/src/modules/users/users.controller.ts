import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendMessage, sendSuccess } from '../../shared/http/api-response.js';
import { badRequest } from '../../shared/errors/http-errors.js';
import {
  createUser,
  getAllRoles,
  getAllUsers,
  getUserById,
  resetUserPassword,
  updateUser,
} from './users.service.js';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from './users.schema.js';

export async function handleGetUsers(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { page?: string; limit?: string };
  const result = await getAllUsers({
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 20,
  });

  return sendSuccess(reply, result);
}

export async function handleGetUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const result = await getUserById(request.params.id);
  return sendSuccess(reply, result);
}

export async function handleCreateUser(request: FastifyRequest, reply: FastifyReply) {
  const parsed = createUserSchema.safeParse(request.body);
  if (!parsed.success) {
    throw badRequest('Validation error', parsed.error.flatten().fieldErrors);
  }

  const result = await createUser(parsed.data, request.user);
  return sendSuccess(reply, result, 201);
}

export async function handleUpdateUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const parsed = updateUserSchema.safeParse(request.body);
  if (!parsed.success) {
    throw badRequest('Validation error', parsed.error.flatten().fieldErrors);
  }

  const result = await updateUser(request.params.id, parsed.data, request.user);
  return sendSuccess(reply, result);
}

export async function handleResetPassword(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const parsed = resetPasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    throw badRequest('Validation error', parsed.error.flatten().fieldErrors);
  }

  await resetUserPassword(request.params.id, parsed.data, request.user);
  return sendMessage(reply, 'Password reset successfully');
}

export async function handleGetRoles(_request: FastifyRequest, reply: FastifyReply) {
  const roles = await getAllRoles();
  return sendSuccess(reply, roles);
}
