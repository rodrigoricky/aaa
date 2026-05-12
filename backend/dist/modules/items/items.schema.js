"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.itemQuerySchema = void 0;
const zod_1 = require("zod");
exports.itemQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    search: zod_1.z.string().trim().optional(),
    category: zod_1.z.string().trim().optional(),
});
