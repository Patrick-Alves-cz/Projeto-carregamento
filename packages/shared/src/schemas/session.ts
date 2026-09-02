import { z } from "zod";

export const startSessionSchema = z.object({
  connectorId: z.string().cuid(),
  vehicleId: z.string().cuid(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const listSessionsQuerySchema = z.object({
  status: z
    .enum(["PENDING", "ACTIVE", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"])
    .optional(),
  stationId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sessionIdParamSchema = z.object({
  id: z.string().cuid(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
