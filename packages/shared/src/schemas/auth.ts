import { z } from "zod";
import { strongPasswordSchema } from "./password";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z
  .object({
    email: z.string().email(),
    password: strongPasswordSchema,
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

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(200),
  password: strongPasswordSchema,
});

export const googleLoginSchema = z.object({
  accessToken: z.string().min(20).max(4096),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
