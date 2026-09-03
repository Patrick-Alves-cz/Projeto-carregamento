import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    fullName: z.string().min(2).max(200),
    phone: z.string().min(8).max(20).optional(),
    role: z.literal("DRIVER").optional().default("DRIVER"),
  })
  .strict();

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
