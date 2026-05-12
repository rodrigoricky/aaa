"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.isAppError = isAppError;
class AppError extends Error {
    statusCode;
    code;
    details;
    expose;
    constructor(statusCode, code, message, context = {}, expose = true) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = context.details;
        this.expose = expose;
    }
}
exports.AppError = AppError;
function isAppError(error) {
    return error instanceof AppError;
}
