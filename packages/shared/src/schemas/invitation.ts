import { z } from "zod";
import { INVITE_ROLES } from "../constants";
import { strongPasswordSchema } from "./password";

export const createInvitationSchema = z.object({
  email: z.string().email(),
  companyId: z.string().cuid(),
  role: z.enum(INVITE_ROLES),
});

export const acceptInvitationSchema = z.object({
  fullName: z.string().min(2).max(200),
  password: strongPasswordSchema,
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
