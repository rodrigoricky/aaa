"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordSchema = exports.updateUserSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
exports.createUserSchema = zod_1.z.object({
    username: zod_1.z.string().min(3).max(100).regex(/^[a-zA-Z0-9_ ]+$/, 'Username contains invalid characters'),
    password: zod_1.z.string().min(1, 'Password is required').max(200),
    roleId: zod_1.z.number().int().positive(),
    legacyUserId: zod_1.z.string().trim().max(50).optional(),
});
exports.updateUserSchema = zod_1.z.object({
    roleId: zod_1.z.number().int().positive().optional(),
    isActive: zod_1.z.boolean().optional(),
    legacyUserId: zod_1.z.string().trim().max(50).nullable().optional(),
});
exports.resetPasswordSchema = zod_1.z.object({
    newPassword: zod_1.z.string().min(1, 'Password is required').max(200),
});
