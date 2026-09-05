export const INTERNAL_PAYMENT_STATUSES = [
  "CREATED",
  "PENDING",
  "AUTHORIZED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUND_PENDING",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

export type InternalPaymentStatus = (typeof INTERNAL_PAYMENT_STATUSES)[number];

const PAID_STATUSES = new Set(["CONFIRMED", "COMPLETED", "RECEIVED", "RECEIVED_IN_CASH", "PAID"]);

export function mapProviderPaymentStatus(raw: string | undefined | null): InternalPaymentStatus {
  const status = (raw ?? "").toUpperCase();
  if (!status || status === "PENDING" || status === "AWAITING_RISK_ANALYSIS" || status === "CREATED") {
    return status === "CREATED" ? "CREATED" : "PENDING";
  }
  if (status === "AUTHORIZED") return "AUTHORIZED";
  if (status === "PROCESSING" || status === "AWAITING_CAPTURE") return "PROCESSING";
  if (PAID_STATUSES.has(status)) return "PAID";
  if (status === "FAILED" || status === "CHARGEBACK_REQUESTED") return "FAILED";
  if (status === "CANCELLED" || status === "DELETED") return "CANCELLED";
  if (status === "EXPIRED" || status === "OVERDUE") return "EXPIRED";
  if (status === "REFUND_PENDING" || status === "REFUND_REQUESTED") return "REFUND_PENDING";
  if (status === "PARTIALLY_REFUNDED") return "PARTIALLY_REFUNDED";
  if (status === "REFUNDED") return "REFUNDED";
  return "PENDING";
}

export function toPrismaPaymentStatus(status: InternalPaymentStatus): string {
  if (status === "PAID" || status === "CREATED") return status === "CREATED" ? "PENDING" : "CONFIRMED";
  return status;
}

export function isPaidStatus(status: string): boolean {
  return mapProviderPaymentStatus(status) === "PAID" || status === "CONFIRMED" || status === "COMPLETED";
}

export function authorizationAmountCents(input: {
  estimatedTotalCents: number;
  minBalanceCents: number;
  energyKwh: number;
  durationMinutes: number;
}): number {
  const floor = Math.max(input.minBalanceCents, 1000);
  return Math.max(input.estimatedTotalCents, floor);
}
