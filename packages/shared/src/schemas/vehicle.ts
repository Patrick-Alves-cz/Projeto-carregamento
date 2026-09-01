import { z } from "zod";
import { CONNECTOR_TYPES } from "../constants";

export const createVehicleSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.number().int().min(1990).max(2100).optional(),
  batteryKwh: z.number().positive().optional(),
  connectorTypes: z.array(z.enum(CONNECTOR_TYPES)).min(1),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
