import type { FastifyReply, FastifyRequest } from 'fastify';
import { badRequest } from '../../shared/errors/http-errors.js';
import { sendSuccess } from '../../shared/http/api-response.js';
import {
  getQaNumberingSettings,
  updateQaNumberingSettings,
} from './numbering.service.js';
import { updateQaNumberingSettingsSchema } from './numbering.schema.js';

export async function handleGetQaNumberingSettings(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const result = await getQaNumberingSettings();
  return sendSuccess(reply, result);
}

export async function handleUpdateQaNumberingSettings(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = updateQaNumberingSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    throw badRequest('Validation error', parsed.error.flatten().fieldErrors);
  }

  const result = await updateQaNumberingSettings(parsed.data);
  return sendSuccess(reply, result);
}