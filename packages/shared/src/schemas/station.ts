import { z } from "zod";
import { CONNECTOR_TYPES } from "../constants";

export const createStationSchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().min(5).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  amenities: z.array(z.string()).default([]),
});

export const updateStationSchema = createStationSchema.partial().extend({
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
});

export const listStationsQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(500).optional(),
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
  minPowerKw: z.coerce.number().positive().optional(),
  connectorType: z.enum(CONNECTOR_TYPES).optional(),
});

export type CreateStationInput = z.infer<typeof createStationSchema>;
export type UpdateStationInput = z.infer<typeof updateStationSchema>;
export type ListStationsQuery = z.infer<typeof listStationsQuerySchema>;
