import type { FastifyReply, FastifyRequest } from 'fastify';
import { badRequest } from '../../shared/errors/http-errors.js';
import { sendSuccess } from '../../shared/http/api-response.js';
import { getPrintableQuantityAdjustment } from '../print/print.service.js';
import {
  createQuantityAdjustment,
  getQuantityAdjustmentMeta,
  getQuantityAdjustmentById,
  listQuantityAdjustments,
  postQuantityAdjustment,
  requestQuantityAdjustmentCancellation,
  updateQuantityAdjustment,
} from './quantity-adjustments.service.js';
import {
  createQuantityAdjustmentSchema,
  listQuantityAdjustmentsSchema,
  requestCancellationSchema,
  updateQuantityAdjustmentSchema,
} from './quantity-adjustments.schema.js';

function getValidationMessage(fieldErrors: Record<string, string[] | undefined>, fallback: string) {
  for (const messages of Object.values(fieldErrors)) {
    const message = messages?.find(Boolean);
    if (message) {
      return message;
    }
  }

  return fallback;
}

export async function handleListQuantityAdjustments(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = listQuantityAdjustmentsSchema.safeParse(request.query);
  if (!parsed.success) {
    throw badRequest('Invalid query', parsed.error.flatten().fieldErrors);
  }

  const result = await listQuantityAdjustments(parsed.data);
  return sendSuccess(reply, result);
}

export async function handleGetQuantityAdjustmentMeta(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const result = await getQuantityAdjustmentMeta();
  return sendSuccess(reply, result);
}

export async function handleGetQuantityAdjustment(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const result = await getQuantityAdjustmentById(request.params.id);
  return sendSuccess(reply, result);
}

export async function handleCreateQuantityAdjustment(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = createQuantityAdjustmentSchema.safeParse(request.body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    throw badRequest(getValidationMessage(fieldErrors, 'Validation error'), fieldErrors);
  }

  const result = await createQuantityAdjustment(parsed.data, request.user);
  return sendSuccess(reply, result, 201);
}

export async function handleUpdateQuantityAdjustment(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const parsed = updateQuantityAdjustmentSchema.safeParse(request.body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    throw badRequest(getValidationMessage(fieldErrors, 'Validation error'), fieldErrors);
  }

  const result = await updateQuantityAdjustment(Number(request.params.id), parsed.data, request.user);
  return sendSuccess(reply, result);
}

export async function handlePostQuantityAdjustment(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const result = await postQuantityAdjustment(Number(request.params.id), request.user);
  return sendSuccess(reply, result);
}

export async function handleRequestQuantityAdjustmentCancellation(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const parsed = requestCancellationSchema.safeParse(request.body);
  if (!parsed.success) {
    throw badRequest('Cancellation reason is required', parsed.error.flatten().fieldErrors);
  }

  const result = await requestQuantityAdjustmentCancellation(
    Number(request.params.id),
    parsed.data.reason,
    request.user
  );
  return sendSuccess(reply, result);
}

export async function handleGetPrintableQuantityAdjustment(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const result = await getPrintableQuantityAdjustment(request.params.id, request.user);
  return sendSuccess(reply, result);
}
