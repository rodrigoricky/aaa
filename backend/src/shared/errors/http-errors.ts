import { AppError } from './app-error.js';

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, 'BAD_REQUEST', message, { details });
}

export function unauthorized(message = 'Unauthorized') {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Forbidden') {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Resource not found') {
  return new AppError(404, 'NOT_FOUND', message);
}

export function conflict(message: string, details?: unknown) {
  return new AppError(409, 'CONFLICT', message, { details });
}

export function unprocessable(message: string, details?: unknown) {
  return new AppError(422, 'UNPROCESSABLE_ENTITY', message, { details });
}

export function methodNotAllowed(message: string) {
  return new AppError(405, 'METHOD_NOT_ALLOWED', message);
}

export function internalError(message = 'Internal server error') {
  return new AppError(500, 'INTERNAL_SERVER_ERROR', message, {}, false);
}
