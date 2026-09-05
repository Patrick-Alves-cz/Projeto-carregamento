/**
 * Calculates session cost in integer cents from energy (kWh) and price per kWh (cents).
 */
export function calculateCostCents(energyKwh: number, pricePerKwhCents: number): number {
  if (energyKwh <= 0 || pricePerKwhCents <= 0) return 0;
  return Math.round(energyKwh * pricePerKwhCents);
}

export function formatCurrencyBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export type SessionCostInput = {
  energyKwh: number;
  durationMinutes: number;
  idleMinutes?: number;
  chargingComplete?: boolean;
  snapshot: {
    pricePerKwhCents: number;
    pricePerMinuteCents: number;
    idleFeeCents: number;
    connectionFeeCents: number;
    parkingPriceCents?: number;
    minimumChargeCents?: number;
  };
};

export type SessionCostBreakdown = {
  energyCents: number;
  timeCents: number;
  sessionFeeCents: number;
  idleCents: number;
  parkingCents: number;
  minimumAppliedCents: number;
  totalCents: number;
};

export function calculateSessionCost(input: SessionCostInput): SessionCostBreakdown {
  const energyCents = calculateCostCents(input.energyKwh, input.snapshot.pricePerKwhCents);
  const timeCents = input.durationMinutes > 0 && input.snapshot.pricePerMinuteCents > 0
    ? Math.round(input.durationMinutes * input.snapshot.pricePerMinuteCents)
    : 0;
  const sessionFeeCents = input.snapshot.connectionFeeCents > 0 ? input.snapshot.connectionFeeCents : 0;
  const idleCents =
    (input.idleMinutes ?? 0) > 0 && input.snapshot.idleFeeCents > 0
      ? Math.round((input.idleMinutes ?? 0) * input.snapshot.idleFeeCents)
      : 0;
  const parkingCents =
    input.chargingComplete && (input.snapshot.parkingPriceCents ?? 0) > 0
      ? input.snapshot.parkingPriceCents ?? 0
      : 0;
  const subtotal = energyCents + timeCents + sessionFeeCents + idleCents + parkingCents;
  const minimum = input.snapshot.minimumChargeCents ?? 0;
  const minimumAppliedCents = subtotal < minimum && subtotal > 0 ? minimum - subtotal : 0;
  return {
    energyCents,
    timeCents,
    sessionFeeCents,
    idleCents,
    parkingCents,
    minimumAppliedCents,
    totalCents: subtotal + minimumAppliedCents,
  };
}

export function calculateEstimatedCost(params: {
  energyKwh: number;
  durationMinutes: number;
  snapshot: SessionCostInput["snapshot"];
}): SessionCostBreakdown {
  return calculateSessionCost({
    energyKwh: params.energyKwh,
    durationMinutes: params.durationMinutes,
    snapshot: params.snapshot,
  });
}

export function calculateCurrentCost(params: SessionCostInput): SessionCostBreakdown {
  return calculateSessionCost(params);
}

export function calculateFinalCost(params: SessionCostInput): SessionCostBreakdown {
  return calculateSessionCost({ ...params, chargingComplete: true });
}
