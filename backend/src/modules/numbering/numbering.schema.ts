import { z } from 'zod';
import { validateQaNumberFormat } from './numbering.service.js';

export const updateQaNumberingSettingsSchema = z.object({
  format: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .superRefine((value, context) => {
      const error = validateQaNumberFormat(value);
      if (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: error,
        });
      }
    }),
  nextValue: z.coerce.number().int().min(1),
  dmNextValue: z.coerce.number().int().min(1).optional(),
  cmNextValue: z.coerce.number().int().min(1).optional(),
});
