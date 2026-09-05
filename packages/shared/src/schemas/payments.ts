import { z } from "zod";

export const createPaymentSchema = z.object({
  amountCents: z.number().int().min(100).max(1_000_000),
  kind: z.enum(["PIX", "CARD", "WALLET"]).default("PIX"),
  paymentMethodId: z.string().cuid().optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

export const simulatePaymentSchema = z.object({
  outcome: z.enum(["CONFIRMED", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED"]),
});

export const webhookPaymentSchema = z.object({
  eventId: z.string().min(8).max(120),
  eventType: z.string().min(3).max(80),
  paymentId: z.string().optional(),
  providerRef: z.string().optional(),
  amountCents: z.number().int().positive().optional(),
  status: z.enum([
    "PENDING",
    "AUTHORIZED",
    "PROCESSING",
    "CONFIRMED",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "REFUNDED",
    "EXPIRED",
    "REFUND_PENDING",
    "PARTIALLY_REFUNDED",
  ]),
});

export const refundPaymentSchema = z.object({
  reason: z.string().min(5).max(500),
  amountCents: z.number().int().positive().optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

export const createPaymentMethodSchema = z.object({
  brand: z.string().min(2).max(32),
  last4: z.string().regex(/^\d{4}$/),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2024).max(2100),
  isDefault: z.boolean().optional(),
  token: z.string().min(8).max(256).optional(),
});

export const createReservationSchema = z.object({
  stationId: z.string().cuid(),
  connectorId: z.string().cuid().optional(),
  vehicleId: z.string().cuid(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
}).refine((value) => value.endAt > value.startAt, {
  message: "endAt must be after startAt",
  path: ["endAt"],
});

export const joinWaitlistSchema = z.object({
  stationId: z.string().cuid().optional(),
  connectorId: z.string().cuid().optional(),
  connectorType: z.enum(["TYPE2", "CCS2", "CHADEMO", "J1772", "NACS", "GB_T", "OTHER"]).optional(),
  scope: z.enum(["CONNECTOR", "CONNECTOR_TYPE", "STATION"]).optional(),
}).refine((value) => Boolean(value.connectorId || value.stationId), {
  message: "connectorId or stationId is required",
});

export const estimateCostSchema = z.object({
  connectorId: z.string().cuid(),
  energyKwh: z.number().min(0).max(500).default(10),
  durationMinutes: z.number().min(0).max(1440).default(30),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type SimulatePaymentInput = z.infer<typeof simulatePaymentSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;
export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;
export type EstimateCostInput = z.infer<typeof estimateCostSchema>;
