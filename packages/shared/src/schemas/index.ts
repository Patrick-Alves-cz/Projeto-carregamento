import { z } from "zod";
import { CONNECTOR_TYPES, USER_ROLES } from "../constants";

export const createCompanySchema = z.object({
  name: z.string().min(2).max(200),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
  cnpj: z.string().optional(),
});

export const createStationSchema = z.object({
  companyId: z.string().cuid(),
  name: z.string().min(2).max(200),
  address: z.string().min(5).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  amenities: z.array(z.string()).default([]),
});

export const createVehicleSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.number().int().min(1990).max(2100).optional(),
  batteryKwh: z.number().positive().optional(),
  connectorTypes: z.array(z.enum(CONNECTOR_TYPES)).min(1),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(USER_ROLES).default("DRIVER"),
  fullName: z.string().min(2).max(200),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type CreateStationInput = z.infer<typeof createStationSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
