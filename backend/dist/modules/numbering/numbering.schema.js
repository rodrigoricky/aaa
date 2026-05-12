"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateQaNumberingSettingsSchema = void 0;
const zod_1 = require("zod");
const numbering_service_js_1 = require("./numbering.service.js");
exports.updateQaNumberingSettingsSchema = zod_1.z.object({
    format: zod_1.z
        .string()
        .trim()
        .min(1)
        .max(120)
        .superRefine((value, context) => {
        const error = (0, numbering_service_js_1.validateQaNumberFormat)(value);
        if (error) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: error,
            });
        }
    }),
    nextValue: zod_1.z.coerce.number().int().min(1),
    dmNextValue: zod_1.z.coerce.number().int().min(1).optional(),
    cmNextValue: zod_1.z.coerce.number().int().min(1).optional(),
});
