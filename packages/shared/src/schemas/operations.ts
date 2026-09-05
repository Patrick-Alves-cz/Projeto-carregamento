import { z } from "zod";

export const createMaintenanceSchema = z.object({
  stationId: z.string().cuid().optional(),
  chargerId: z.string().cuid().optional(),
  connectorId: z.string().cuid().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().min(3).max(280),
}).refine((value) => value.endsAt > value.startsAt, {
  message: "endsAt must be after startsAt",
  path: ["endsAt"],
}).refine((value) => Boolean(value.stationId || value.chargerId || value.connectorId), {
  message: "stationId, chargerId or connectorId is required",
});

export const resolveIncidentSchema = z.object({
  resolution: z.string().min(3).max(500),
  status: z.enum(["RESOLVED", "IGNORED"]).default("RESOLVED"),
});

export const changeAvailabilitySchema = z.object({
  connectorId: z.string().cuid().optional(),
  availability: z.enum(["Inoperative", "Operative"]),
  confirm: z.literal(true),
});

export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>;
export type ChangeAvailabilityInput = z.infer<typeof changeAvailabilitySchema>;
