import 'dotenv/config';
import { z } from 'zod';

function parseSqlServerUrl(raw: string | undefined) {
  if (!raw) return {};

  const trimmed = raw.trim();
  const withoutProtocol = trimmed.replace(/^sqlserver:\/\//i, '');
  const segments = withoutProtocol.split(';').map((segment) => segment.trim()).filter(Boolean);
  const [hostPort, ...pairs] = segments;
  const [server, portText] = hostPort.split(':');

  const parsedPairs = Object.fromEntries(
    pairs
      .map((pair) => {
        const [key, value] = pair.split('=');
        return [key, value];
      })
      .filter(([key, value]) => Boolean(key && value))
  );

  return {
    SQLSERVER_HOST: server || undefined,
    SQLSERVER_PORT: portText ? Number(portText) : undefined,
    SQLSERVER_DATABASE: parsedPairs.databaseName,
    SQLSERVER_ENCRYPT: parsedPairs.encrypt,
    SQLSERVER_TRUST_SERVER_CERTIFICATE: parsedPairs.trustServerCertificate,
  };
}

function envBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value == null || value === '') {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }

    return value;
  }, z.boolean());
}

const sqlUrlValues = parseSqlServerUrl(process.env.SQLSERVER_URL);

const envSchema = z.object({
  SQLSERVER_URL: z.string().optional(),
  SQLSERVER_HOST: z.string().min(1),
  SQLSERVER_PORT: z.coerce.number().int().positive().default(1433),
  SQLSERVER_DATABASE: z.string().min(1),
  SQLSERVER_USER: z.string().default('sa'),
  SQLSERVER_PASSWORD: z.string().min(1),
  SQLSERVER_ENCRYPT: envBoolean(false),
  SQLSERVER_TRUST_SERVER_CERTIFICATE: envBoolean(true),
  SQLSERVER_POOL_MIN: z.coerce.number().int().min(0).default(0),
  SQLSERVER_POOL_MAX: z.coerce.number().int().min(1).default(10),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('8h'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  UTILITY_SCHEMA: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'UTILITY_SCHEMA must be a valid SQL identifier')
    .default('utility'),
  UTILITY_AUTO_INIT: envBoolean(true),
  LEGACY_AUTH_PROVISIONING_ENABLED: envBoolean(true),
  UTILITY_BOOTSTRAP_ADMIN_USERNAME: z.string().default('admin'),
  UTILITY_BOOTSTRAP_ADMIN_PASSWORD: z.string().min(1).optional(),
  SUPPORT_POST_OVERRIDE_ENABLED: envBoolean(false),
  QA_NUMBER_START: z.coerce.number().int().positive().default(1),
  DM_NUMBER_START: z.coerce.number().int().positive().default(1),
  CM_NUMBER_START: z.coerce.number().int().positive().default(1),
});

const parsed = envSchema.safeParse({
  ...sqlUrlValues,
  ...process.env,
});

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
