import type { FastifyReply, FastifyRequest } from 'fastify';
import { badRequest } from '../../shared/errors/http-errors.js';
import { sendSuccess } from '../../shared/http/api-response.js';
import { itemQuerySchema } from './items.schema.js';
import {
  getCategories,
  getItemById,
  getItems,
  rejectInventoryWrite,
} from './items.service.js';

export async function handleGetItems(request: FastifyRequest, reply: FastifyReply) {
  const parsed = itemQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw badRequest('Invalid query', parsed.error.flatten().fieldErrors);
  }

  const result = await getItems(parsed.data);
  return sendSuccess(reply, result);
}

export async function handleGetItem(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const result = await getItemById(request.params.id);
  return sendSuccess(reply, result);
}

export async function handleGetCategories(_request: FastifyRequest, reply: FastifyReply) {
  const result = await getCategories();
  return sendSuccess(reply, result);
}

export async function handleCreateItem() {
  await rejectInventoryWrite();
}

export async function handleUpdateItem() {
  await rejectInventoryWrite();
}

export async function handleDeleteItem() {
  await rejectInventoryWrite();
}
