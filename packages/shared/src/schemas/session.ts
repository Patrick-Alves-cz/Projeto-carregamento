import { z } from "zod";

export const SESSION_STATUSES = [
  "PENDING",
  "PREPARING",
  "ACTIVE",
  "PAUSED",
  "CHARGING_COMPLETE",
  "IDLE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export const startSessionSchema = z.object({
  connectorId: z.string().cuid(),
  vehicleId: z.string().cuid(),
  reservationId: z.string().cuid().optional(),
  paymentKind: z.enum(["WALLET", "PIX", "CARD"]).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const stopSessionSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .default({});

export const listSessionsQuerySchema = z.object({
  status: z.enum(SESSION_STATUSES).optional(),
  stationId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
  vehicleId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sessionIdParamSchema = z.object({
  id: z.string().cuid(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type StopSessionInput = z.infer<typeof stopSessionSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
