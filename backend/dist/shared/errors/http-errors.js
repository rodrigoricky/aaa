"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.badRequest = badRequest;
exports.unauthorized = unauthorized;
exports.forbidden = forbidden;
exports.notFound = notFound;
exports.conflict = conflict;
exports.unprocessable = unprocessable;
exports.methodNotAllowed = methodNotAllowed;
exports.internalError = internalError;
const app_error_js_1 = require("./app-error.js");
function badRequest(message, details) {
    return new app_error_js_1.AppError(400, 'BAD_REQUEST', message, { details });
}
function unauthorized(message = 'Unauthorized') {
    return new app_error_js_1.AppError(401, 'UNAUTHORIZED', message);
}
function forbidden(message = 'Forbidden') {
    return new app_error_js_1.AppError(403, 'FORBIDDEN', message);
}
function notFound(message = 'Resource not found') {
    return new app_error_js_1.AppError(404, 'NOT_FOUND', message);
}
function conflict(message, details) {
    return new app_error_js_1.AppError(409, 'CONFLICT', message, { details });
}
function unprocessable(message, details) {
    return new app_error_js_1.AppError(422, 'UNPROCESSABLE_ENTITY', message, { details });
}
function methodNotAllowed(message) {
    return new app_error_js_1.AppError(405, 'METHOD_NOT_ALLOWED', message);
}
function internalError(message = 'Internal server error') {
    return new app_error_js_1.AppError(500, 'INTERNAL_SERVER_ERROR', message, {}, false);
}
