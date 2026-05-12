"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestCancellationSchema = exports.listQuantityAdjustmentsSchema = exports.updateQuantityAdjustmentSchema = exports.createQuantityAdjustmentSchema = void 0;
const zod_1 = require("zod");
const inventory_adjustment_calculator_js_1 = require("./inventory-adjustment-calculator.js");
const MAX_QA_LINES = 8;
const MAX_QA_LINES_MESSAGE = 'Maximum of 8 items per Quantity Adjustment.';
const quantityInputSchema = zod_1.z.preprocess((value) => {
    if (value === null || value === undefined)
        return Number.NaN;
    if (typeof value === 'string' && value.trim() === '')
        return Number.NaN;
    return value;
}, zod_1.z.coerce
    .number()
    .finite('Quantity must be a valid number')
    .refine((value) => Math.abs(value) <= inventory_adjustment_calculator_js_1.MAX_ABSOLUTE_ADJUSTMENT_QTY, 'Quantity is too large'));
const lineSchema = zod_1.z.object({
    itemcode: zod_1.z.string().trim().min(1).max(50),
    entryMode: zod_1.z.enum(['DELTA', 'SET']).default('DELTA'),
    requestedQty: quantityInputSchema,
    itemRemark: zod_1.z.string().trim().max(500).optional(),
});
exports.createQuantityAdjustmentSchema = zod_1.z.object({
    refType: zod_1.z.enum(['DM', 'CM']),
    refNo: zod_1.z.string().trim().max(50).optional(),
    lines: zod_1.z
        .array(lineSchema)
        .min(1, 'At least one adjustment line is required')
        .max(MAX_QA_LINES, MAX_QA_LINES_MESSAGE),
});
exports.updateQuantityAdjustmentSchema = zod_1.z.object({
    lines: zod_1.z
        .array(lineSchema)
        .min(1, 'At least one adjustment line is required')
        .max(MAX_QA_LINES, MAX_QA_LINES_MESSAGE),
});
exports.listQuantityAdjustmentsSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    search: zod_1.z.string().trim().optional(),
    status: zod_1.z.enum(['SAVED', 'POSTED', 'PENDING_CANCELLATION', 'CANCELLED']).optional(),
});
exports.requestCancellationSchema = zod_1.z.object({
    reason: zod_1.z.string().transform((value) => value.trim()).pipe(zod_1.z.string().min(1, 'Cancellation reason is required')),
});
