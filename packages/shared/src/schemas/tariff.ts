import { z } from "zod";

export const createTariffSchema = z
  .object({
    companyId: z.string().cuid(),
    name: z.string().min(2).max(100),
    pricePerKwhCents: z.number().int().min(1).max(100000),
    pricePerMinuteCents: z.number().int().min(0).max(100000).default(0),
    idleFeeCents: z.number().int().min(0).max(100000).default(0),
    connectionFeeCents: z.number().int().min(0).max(100000).default(0),
    minBalanceCents: z.number().int().min(0).max(100000).default(1000),
    currency: z.string().length(3).default("BRL"),
    validFrom: z.coerce.date().optional().nullable(),
    validTo: z.coerce.date().optional().nullable(),
    active: z.boolean().default(true),
  })
  .refine((value) => !value.validFrom || !value.validTo || value.validFrom <= value.validTo, {
    message: "validTo must be after validFrom",
    path: ["validTo"],
  });

export const updateTariffSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    pricePerKwhCents: z.number().int().min(1).max(100000).optional(),
    pricePerMinuteCents: z.number().int().min(0).max(100000).optional(),
    idleFeeCents: z.number().int().min(0).max(100000).optional(),
    connectionFeeCents: z.number().int().min(0).max(100000).optional(),
    minBalanceCents: z.number().int().min(0).max(100000).optional(),
    currency: z.string().length(3).optional(),
    validFrom: z.coerce.date().optional().nullable(),
    validTo: z.coerce.date().optional().nullable(),
    active: z.boolean().optional(),
  })
  .refine((value) => !value.validFrom || !value.validTo || value.validFrom <= value.validTo, {
    message: "validTo must be after validFrom",
    path: ["validTo"],
  });

export type CreateTariffInput = z.infer<typeof createTariffSchema>;
export type UpdateTariffInput = z.infer<typeof updateTariffSchema>;
