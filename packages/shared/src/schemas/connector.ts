import { z } from "zod";
import { CONNECTOR_TYPES } from "../constants";

export const createConnectorSchema = z.object({
  chargerId: z.string().cuid(),
  number: z.number().int().positive(),
  type: z.enum(CONNECTOR_TYPES),
  maxPowerKw: z.number().positive(),
});

export const updateConnectorSchema = z.object({
  type: z.enum(CONNECTOR_TYPES).optional(),
  maxPowerKw: z.number().positive().optional(),
  status: z.enum(["AVAILABLE", "OCCUPIED", "UNAVAILABLE", "FAULTED"]).optional(),
});

export type CreateConnectorInput = z.infer<typeof createConnectorSchema>;
export type UpdateConnectorInput = z.infer<typeof updateConnectorSchema>;
