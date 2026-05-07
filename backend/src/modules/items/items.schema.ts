import { z } from 'zod';

export const itemQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
});

export type ItemQuery = z.infer<typeof itemQuerySchema>;
