import { z } from "zod";
import { CONNECTOR_TYPES, CURRENT_TYPES, STATION_ACCESS_TYPES } from "../constants";

export const openingHoursSchema = z
  .object({
    label: z.string().max(120).optional(),
    alwaysOpen: z.boolean().optional(),
    timezone: z.string().max(80).optional(),
  })
  .passthrough();

export const createStationSchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().min(5).max(500),
  city: z.string().min(2).max(120).optional(),
  postalCode: z.string().min(5).max(20).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  amenities: z.array(z.string()).default([]),
  accessType: z.enum(STATION_ACCESS_TYPES).optional().default("PUBLIC"),
  openingHours: openingHoursSchema.optional(),
  tariffId: z.string().cuid().optional().nullable(),
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

export const nearbyStationsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(500).default(25),
  connectorType: z.enum(CONNECTOR_TYPES).optional(),
  powerMin: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  availability: z.string().optional(),
  availableNow: z.string().optional(),
  vehicleId: z.string().cuid().optional(),
  currentType: z.enum(CURRENT_TYPES).optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

export const stationDetailQuerySchema = z.object({
  vehicleId: z.string().cuid().optional(),
});

export type CreateStationInput = z.infer<typeof createStationSchema>;
export type UpdateStationInput = z.infer<typeof updateStationSchema>;
export type ListStationsQuery = z.infer<typeof listStationsQuerySchema>;
export type NearbyStationsQuery = z.infer<typeof nearbyStationsQuerySchema>;
export type StationDetailQuery = z.infer<typeof stationDetailQuerySchema>;
