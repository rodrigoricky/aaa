"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSuccess = sendSuccess;
exports.sendMessage = sendMessage;
function sendSuccess(reply, data, statusCode = 200) {
    return reply.status(statusCode).send({
        success: true,
        data,
        error: null,
    });
}
function sendMessage(reply, message, statusCode = 200) {
    return sendSuccess(reply, { message }, statusCode);
}
