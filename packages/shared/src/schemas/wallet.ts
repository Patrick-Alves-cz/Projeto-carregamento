import { z } from "zod";
import { WALLET_TOPUP_MAX_CENTS, WALLET_TOPUP_MIN_CENTS } from "../constants";

export const walletTopUpSchema = z.object({
  amountCents: z
    .number()
    .int()
    .min(WALLET_TOPUP_MIN_CENTS)
    .max(WALLET_TOPUP_MAX_CENTS),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

export const listWalletTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type WalletTopUpInput = z.infer<typeof walletTopUpSchema>;
export type ListWalletTransactionsQuery = z.infer<typeof listWalletTransactionsQuerySchema>;
