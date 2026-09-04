import { z } from "zod";

export const createChargerSchema = z.object({
  stationId: z.string().cuid(),
  serialNumber: z.string().min(2).max(100),
  identity: z.string().min(2).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  vendor: z.string().min(1).max(100).optional(),
  maxPowerKw: z.number().positive(),
  providerId: z.string().optional(),
});

export const updateChargerSchema = z.object({
  model: z.string().min(1).max(100).optional(),
  maxPowerKw: z.number().positive().optional(),
  status: z
    .enum([
      "AVAILABLE",
      "PREPARING",
      "CHARGING",
      "SUSPENDED",
      "FINISHING",
      "UNAVAILABLE",
      "FAULTED",
      "OFFLINE",
    ])
    .optional(),
  providerId: z.string().optional(),
});

export type CreateChargerInput = z.infer<typeof createChargerSchema>;
export type UpdateChargerInput = z.infer<typeof updateChargerSchema>;
