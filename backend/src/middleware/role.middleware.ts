import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PermissionSnapshot, RoleName } from '../shared/types/index.js';
import { forbidden, unauthorized } from '../shared/errors/http-errors.js';

export function requirePermission(permission: keyof PermissionSnapshot) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user) {
      throw unauthorized();
    }

    if (!user.permissions[permission]) {
      throw forbidden('Forbidden: insufficient permissions');
    }
  };
}

export function requireRoles(...roles: RoleName[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user) {
      throw unauthorized();
    }

    if (!roles.includes(user.role)) {
      throw forbidden('Forbidden: insufficient role');
    }
  };
}
