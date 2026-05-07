import type { AuthenticatedUser } from '../shared/types/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}
