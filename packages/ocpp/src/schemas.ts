import { z } from "zod";

export const bootNotificationSchema = z.object({
  chargePointVendor: z.string().min(1).max(20),
  chargePointModel: z.string().min(1).max(20),
  chargePointSerialNumber: z.string().max(25).optional(),
  chargeBoxSerialNumber: z.string().max(25).optional(),
  firmwareVersion: z.string().max(50).optional(),
  iccid: z.string().max(20).optional(),
  imsi: z.string().max(20).optional(),
  meterType: z.string().max(25).optional(),
  meterSerialNumber: z.string().max(25).optional(),
});

export const heartbeatSchema = z.object({}).passthrough();

export const statusNotificationSchema = z.object({
  connectorId: z.number().int().min(0),
  errorCode: z.string().min(1),
  status: z.string().min(1),
  info: z.string().max(50).optional(),
  timestamp: z.string().optional(),
  vendorId: z.string().max(255).optional(),
  vendorErrorCode: z.string().max(50).optional(),
});

export const authorizeSchema = z.object({
  idTag: z.string().min(1).max(20),
});

export const startTransactionSchema = z.object({
  connectorId: z.number().int().positive(),
  idTag: z.string().min(1).max(20),
  meterStart: z.number().int().min(0),
  timestamp: z.string().min(1),
  reservationId: z.number().int().optional(),
});

export const sampledValueSchema = z.object({
  value: z.string(),
  measurand: z.string().optional(),
  unit: z.string().optional(),
  context: z.string().optional(),
  format: z.string().optional(),
  location: z.string().optional(),
  phase: z.string().optional(),
});

export const meterValuesSchema = z.object({
  connectorId: z.number().int().min(0),
  transactionId: z.number().int().optional(),
  meterValue: z
    .array(
      z.object({
        timestamp: z.string(),
        sampledValue: z.array(sampledValueSchema).min(1),
      }),
    )
    .min(1),
});

export const stopTransactionSchema = z.object({
  transactionId: z.number().int(),
  idTag: z.string().max(20).optional(),
  timestamp: z.string().min(1),
  meterStop: z.number().int().min(0),
  reason: z.string().optional(),
  transactionData: z.array(z.unknown()).optional(),
});

export const remoteStartResultSchema = z.object({
  status: z.enum(["Accepted", "Rejected"]),
});

export const remoteStopResultSchema = z.object({
  status: z.enum(["Accepted", "Rejected"]),
});

export const resetResultSchema = z.object({
  status: z.enum(["Accepted", "Rejected"]),
});

export const changeAvailabilityResultSchema = z.object({
  status: z.enum(["Accepted", "Rejected", "Scheduled"]),
});
