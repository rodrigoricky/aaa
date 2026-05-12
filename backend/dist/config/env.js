"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
function parseSqlServerUrl(raw) {
    if (!raw)
        return {};
    const trimmed = raw.trim();
    const withoutProtocol = trimmed.replace(/^sqlserver:\/\//i, '');
    const segments = withoutProtocol.split(';').map((segment) => segment.trim()).filter(Boolean);
    const [hostPort, ...pairs] = segments;
    const [server, portText] = hostPort.split(':');
    const parsedPairs = Object.fromEntries(pairs
        .map((pair) => {
        const [key, value] = pair.split('=');
        return [key, value];
    })
        .filter(([key, value]) => Boolean(key && value)));
    return {
        SQLSERVER_HOST: server || undefined,
        SQLSERVER_PORT: portText ? Number(portText) : undefined,
        SQLSERVER_DATABASE: parsedPairs.databaseName,
        SQLSERVER_ENCRYPT: parsedPairs.encrypt,
        SQLSERVER_TRUST_SERVER_CERTIFICATE: parsedPairs.trustServerCertificate,
    };
}
function envBoolean(defaultValue) {
    return zod_1.z.preprocess((value) => {
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
    }, zod_1.z.boolean());
}
const sqlUrlValues = parseSqlServerUrl(process.env.SQLSERVER_URL);
const envSchema = zod_1.z.object({
    SQLSERVER_URL: zod_1.z.string().optional(),
    SQLSERVER_HOST: zod_1.z.string().min(1),
    SQLSERVER_PORT: zod_1.z.coerce.number().int().positive().default(1433),
    SQLSERVER_DATABASE: zod_1.z.string().min(1),
    SQLSERVER_USER: zod_1.z.string().default('sa'),
    SQLSERVER_PASSWORD: zod_1.z.string().min(1),
    SQLSERVER_ENCRYPT: envBoolean(false),
    SQLSERVER_TRUST_SERVER_CERTIFICATE: envBoolean(true),
    SQLSERVER_POOL_MIN: zod_1.z.coerce.number().int().min(0).default(0),
    SQLSERVER_POOL_MAX: zod_1.z.coerce.number().int().min(1).default(10),
    JWT_SECRET: zod_1.z.string().min(16),
    JWT_EXPIRES_IN: zod_1.z.string().default('8h'),
    PORT: zod_1.z.coerce.number().default(3001),
    HOST: zod_1.z.string().default('0.0.0.0'),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    FRONTEND_URL: zod_1.z.string().default('http://localhost:5173'),
    BCRYPT_ROUNDS: zod_1.z.coerce.number().default(12),
    UTILITY_SCHEMA: zod_1.z
        .string()
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'UTILITY_SCHEMA must be a valid SQL identifier')
        .default('utility'),
    UTILITY_AUTO_INIT: envBoolean(true),
    LEGACY_AUTH_PROVISIONING_ENABLED: envBoolean(true),
    UTILITY_BOOTSTRAP_ADMIN_USERNAME: zod_1.z.string().default('admin'),
    UTILITY_BOOTSTRAP_ADMIN_PASSWORD: zod_1.z.string().min(1).optional(),
    SUPPORT_POST_OVERRIDE_ENABLED: envBoolean(false),
    QA_NUMBER_START: zod_1.z.coerce.number().int().positive().default(1),
    DM_NUMBER_START: zod_1.z.coerce.number().int().positive().default(1),
    CM_NUMBER_START: zod_1.z.coerce.number().int().positive().default(1),
});
const parsed = envSchema.safeParse({
    ...sqlUrlValues,
    ...process.env,
});
if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
