export const STATION_AVAILABILITY_STATES = [
  "AVAILABLE",
  "LIMITED",
  "BUSY",
  "RESERVED",
  "OFFLINE",
  "FAULTED",
  "MAINTENANCE",
] as const;
export type StationAvailabilityState = (typeof STATION_AVAILABILITY_STATES)[number];

export type StationAvailabilityCounts = {
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  faulted: number;
  offline: number;
};

export function deriveStationAvailability(
  counts: StationAvailabilityCounts,
  options?: { stationStatus?: string; inMaintenance?: boolean },
): StationAvailabilityState {
  if (options?.inMaintenance || options?.stationStatus === "MAINTENANCE") return "MAINTENANCE";
  if (options?.stationStatus === "INACTIVE") return "OFFLINE";
  const { total, available, occupied, reserved, faulted, offline } = counts;
  if (total <= 0) return "OFFLINE";
  if (available > 0) {
    if (faulted >= total / 2 || offline >= total / 2) return "LIMITED";
    return "AVAILABLE";
  }
  if (offline === total) return "OFFLINE";
  if (faulted > total / 2) return "FAULTED";
  if (occupied > 0) return "BUSY";
  if (reserved > 0) return "RESERVED";
  return "LIMITED";
}

export function stationAvailabilityDriverLabel(state: StationAvailabilityState): string {
  if (state === "AVAILABLE") return "Disponível agora";
  if (state === "LIMITED") return "Disponibilidade limitada";
  if (state === "BUSY") return "Ocupada";
  if (state === "RESERVED") return "Reservada";
  if (state === "MAINTENANCE") return "Em manutenção";
  if (state === "FAULTED") return "Com falha";
  return "Offline";
}
