import { z } from 'zod';
import { MAX_ABSOLUTE_ADJUSTMENT_QTY } from './inventory-adjustment-calculator.js';

const MAX_QA_LINES = 8;
const MAX_QA_LINES_MESSAGE = 'Maximum of 8 items per Quantity Adjustment.';
const quantityInputSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return Number.NaN;
    if (typeof value === 'string' && value.trim() === '') return Number.NaN;
    return value;
  },
  z.coerce
    .number()
    .finite('Quantity must be a valid number')
    .refine(
      (value) => Math.abs(value) <= MAX_ABSOLUTE_ADJUSTMENT_QTY,
      'Quantity is too large'
    )
);

const lineSchema = z.object({
  itemcode: z.string().trim().min(1).max(50),
  entryMode: z.enum(['DELTA', 'SET']).default('DELTA'),
  requestedQty: quantityInputSchema,
  itemRemark: z.string().trim().max(500).optional(),
});

export const createQuantityAdjustmentSchema = z.object({
  refType: z.enum(['DM', 'CM']),
  refNo: z.string().trim().max(50).optional(),
  lines: z
    .array(lineSchema)
    .min(1, 'At least one adjustment line is required')
    .max(MAX_QA_LINES, MAX_QA_LINES_MESSAGE),
});

export const updateQuantityAdjustmentSchema = z.object({
  lines: z
    .array(lineSchema)
    .min(1, 'At least one adjustment line is required')
    .max(MAX_QA_LINES, MAX_QA_LINES_MESSAGE),
});

export const listQuantityAdjustmentsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['SAVED', 'POSTED', 'PENDING_CANCELLATION', 'CANCELLED']).optional(),
});

export const requestCancellationSchema = z.object({
  reason: z.string().transform((value) => value.trim()).pipe(z.string().min(1, 'Cancellation reason is required')),
});

export type CreateQuantityAdjustmentInput = z.infer<typeof createQuantityAdjustmentSchema>;
export type UpdateQuantityAdjustmentInput = z.infer<typeof updateQuantityAdjustmentSchema>;
export type ListQuantityAdjustmentsInput = z.infer<typeof listQuantityAdjustmentsSchema>;
export type RequestCancellationInput = z.infer<typeof requestCancellationSchema>;
