import { z } from "zod";
import { CONNECTOR_TYPES } from "../constants";

export const createConnectorSchema = z.object({
  chargerId: z.string().cuid(),
  number: z.number().int().positive(),
  type: z.enum(CONNECTOR_TYPES),
  maxPowerKw: z.number().positive(),
  tariffId: z.string().cuid().optional().nullable(),
});

export const updateConnectorSchema = z.object({
  type: z.enum(CONNECTOR_TYPES).optional(),
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
    ])
    .optional(),
  tariffId: z.string().cuid().optional().nullable(),
});

export type CreateConnectorInput = z.infer<typeof createConnectorSchema>;
export type UpdateConnectorInput = z.infer<typeof updateConnectorSchema>;
