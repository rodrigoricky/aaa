"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginUser = loginUser;
exports.getProfile = getProfile;
const jwt_js_1 = require("../../shared/utils/jwt.js");
const http_errors_js_1 = require("../../shared/errors/http-errors.js");
const audit_js_1 = require("../../utils/audit.js");
const sql_server_js_1 = require("../../shared/database/sql-server.js");
const users_service_js_1 = require("../users/users.service.js");
async function loginUser(input) {
    /**
     * Architectural decision:
     * - Primary authentication uses utility-owned app_users with bcrypt hashes.
     * - Optional first-login provisioning can read legacy user_access credentials only to
     *   bootstrap standalone utility accounts when explicitly enabled.
     *
     * We do not authenticate directly against the legacy POS password store as the main
     * strategy because its format is weak and unsuitable as a production baseline.
     */
    const user = await (0, users_service_js_1.loginWithProvisioning)(input.username, input.password);
    if (!user) {
        throw (0, http_errors_js_1.unauthorized)('Invalid credentials');
    }
    const pool = await (0, sql_server_js_1.getSqlPool)();
    await (0, audit_js_1.recordAuditEvent)(pool, {
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
    const token = (0, jwt_js_1.signToken)({
        userId: user.id,
        username: user.username,
    });
    return {
        token,
        user,
    };
}
async function getProfile(userId) {
    return (0, users_service_js_1.getAppUserById)(userId);
}
