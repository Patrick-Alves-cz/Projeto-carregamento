export type TariffLike = {
  id: string;
  name: string;
  pricePerKwhCents: number;
  pricePerMinuteCents: number;
  idleFeeCents: number;
  connectionFeeCents: number;
  minBalanceCents: number;
  currency: string;
  active: boolean;
  validFrom: Date | null;
  validTo: Date | null;
};

export type TariffSnapshot = {
  id: string;
  name: string;
  pricePerKwhCents: number;
  pricePerMinuteCents: number;
  idleFeeCents: number;
  connectionFeeCents: number;
  minBalanceCents: number;
  currency: string;
};

export function isTariffEffective(tariff: TariffLike, now = new Date()): boolean {
  if (!tariff.active) return false;
  if (tariff.validFrom && tariff.validFrom > now) return false;
  if (tariff.validTo && tariff.validTo < now) return false;
  return true;
}

export function pickEffectiveTariff(params: {
  connectorTariff?: TariffLike | null;
  stationTariff?: TariffLike | null;
  companyTariffs: TariffLike[];
  now?: Date;
}): TariffLike | null {
  const now = params.now ?? new Date();
  const candidates = [params.connectorTariff, params.stationTariff, ...params.companyTariffs];
  for (const candidate of candidates) {
    if (candidate && isTariffEffective(candidate, now)) return candidate;
  }
  return null;
}

export function toTariffSnapshot(tariff: TariffLike): TariffSnapshot {
  return {
    id: tariff.id,
    name: tariff.name,
    pricePerKwhCents: tariff.pricePerKwhCents,
    pricePerMinuteCents: tariff.pricePerMinuteCents,
    idleFeeCents: tariff.idleFeeCents,
    connectionFeeCents: tariff.connectionFeeCents,
    minBalanceCents: tariff.minBalanceCents,
    currency: tariff.currency,
  };
}

export function readTariffSnapshot(value: unknown): TariffSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.pricePerKwhCents !== "number") return null;
  return {
    id: typeof record.id === "string" ? record.id : "",
    name: typeof record.name === "string" ? record.name : "Tarifa",
    pricePerKwhCents: record.pricePerKwhCents,
    pricePerMinuteCents: typeof record.pricePerMinuteCents === "number" ? record.pricePerMinuteCents : 0,
    idleFeeCents: typeof record.idleFeeCents === "number" ? record.idleFeeCents : 0,
    connectionFeeCents: typeof record.connectionFeeCents === "number" ? record.connectionFeeCents : 0,
    minBalanceCents: typeof record.minBalanceCents === "number" ? record.minBalanceCents : 1000,
    currency: typeof record.currency === "string" ? record.currency : "BRL",
  };
}
