import type { FastifyReply } from 'fastify';

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiFailure {
  success: false;
  data: null;
  error: ApiErrorPayload;
  message: string;
}

export function sendSuccess<T>(reply: FastifyReply, data: T, statusCode = 200) {
  return reply.status(statusCode).send({
    success: true,
    data,
    error: null,
  } satisfies ApiSuccess<T>);
}

export function sendMessage(reply: FastifyReply, message: string, statusCode = 200) {
  return sendSuccess(reply, { message }, statusCode);
}
