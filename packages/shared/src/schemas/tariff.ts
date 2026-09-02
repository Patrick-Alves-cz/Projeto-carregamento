import { z } from "zod";

export const createTariffSchema = z.object({
  companyId: z.string().cuid(),
  name: z.string().min(2).max(100),
  pricePerKwhCents: z.number().int().min(1).max(100000),
  minBalanceCents: z.number().int().min(0).default(500),
  currency: z.string().length(3).default("BRL"),
  active: z.boolean().default(true),
});

export const updateTariffSchema = createTariffSchema.partial().omit({ companyId: true });

export type CreateTariffInput = z.infer<typeof createTariffSchema>;
export type UpdateTariffInput = z.infer<typeof updateTariffSchema>;
