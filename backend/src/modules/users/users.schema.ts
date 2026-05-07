import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string().min(3).max(100).regex(/^[a-zA-Z0-9_ ]+$/, 'Username contains invalid characters'),
  password: z.string().min(1, 'Password is required').max(200),
  roleId: z.number().int().positive(),
  legacyUserId: z.string().trim().max(50).optional(),
});

export const updateUserSchema = z.object({
  roleId: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  legacyUserId: z.string().trim().max(50).nullable().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(1, 'Password is required').max(200),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
