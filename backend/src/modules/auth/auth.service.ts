import type { AuthenticatedUser } from '../../shared/types/index.js';
import { signToken } from '../../shared/utils/jwt.js';
import { unauthorized } from '../../shared/errors/http-errors.js';
import { recordAuditEvent } from '../../utils/audit.js';
import { getSqlPool } from '../../shared/database/sql-server.js';
import { loginWithProvisioning, getAppUserById } from '../users/users.service.js';
import type { LoginInput } from './auth.schema.js';

export interface LoginResult {
  token: string;
  user: AuthenticatedUser;
}

export async function loginUser(input: LoginInput): Promise<LoginResult> {
  /**
   * Architectural decision:
   * - Primary authentication uses utility-owned app_users with bcrypt hashes.
   * - Optional first-login provisioning can read legacy user_access credentials only to
   *   bootstrap standalone utility accounts when explicitly enabled.
   *
   * We do not authenticate directly against the legacy POS password store as the main
   * strategy because its format is weak and unsuitable as a production baseline.
   */
  const user = await loginWithProvisioning(input.username, input.password);

  if (!user) {
    throw unauthorized('Invalid credentials');
  }

  const pool = await getSqlPool();
  await recordAuditEvent(pool, {
    eventType: 'LOGIN_SUCCESS',
    entityType: 'APP_USER',
    entityId: user.id,
    actorUserId: user.id,
    actorUsername: user.username,
    details: {
      role: user.role,
      legacyUserId: user.legacyUserId,
    },
  });

  const token = signToken({
    userId: user.id,
    username: user.username,
  });

  return {
    token,
    user,
  };
}

export async function getProfile(userId: number) {
  return getAppUserById(userId);
}
