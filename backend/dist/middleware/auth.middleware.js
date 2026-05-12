"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const http_errors_js_1 = require("../shared/errors/http-errors.js");
const jwt_js_1 = require("../shared/utils/jwt.js");
const users_service_js_1 = require("../modules/users/users.service.js");
async function authenticate(request, _reply) {
    const token = request.cookies?.['gnp_token'];
    if (!token) {
        throw (0, http_errors_js_1.unauthorized)();
    }
    const payload = (0, jwt_js_1.verifyToken)(token);
    request.user = await (0, users_service_js_1.getAppUserById)(payload.userId);
}
