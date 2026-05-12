"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
exports.requireRoles = requireRoles;
const http_errors_js_1 = require("../shared/errors/http-errors.js");
function requirePermission(permission) {
    return async (request, _reply) => {
        const user = request.user;
        if (!user) {
            throw (0, http_errors_js_1.unauthorized)();
        }
        if (!user.permissions[permission]) {
            throw (0, http_errors_js_1.forbidden)('Forbidden: insufficient permissions');
        }
    };
}
function requireRoles(...roles) {
    return async (request, _reply) => {
        const user = request.user;
        if (!user) {
            throw (0, http_errors_js_1.unauthorized)();
        }
        if (!roles.includes(user.role)) {
            throw (0, http_errors_js_1.forbidden)('Forbidden: insufficient role');
        }
    };
}
