export const CHARGER_STATUSES = [
  "AVAILABLE",
  "PREPARING",
  "CHARGING",
  "SUSPENDED",
  "FINISHING",
  "UNAVAILABLE",
  "FAULTED",
  "OFFLINE",
] as const;

export type ChargerOperationalStatus = (typeof CHARGER_STATUSES)[number];

const VALID_TRANSITIONS: Record<ChargerOperationalStatus, ChargerOperationalStatus[]> = {
  AVAILABLE: ["PREPARING", "UNAVAILABLE", "FAULTED", "OFFLINE"],
  PREPARING: ["CHARGING", "AVAILABLE", "FAULTED", "OFFLINE"],
  CHARGING: ["SUSPENDED", "FINISHING", "FAULTED", "OFFLINE"],
  SUSPENDED: ["CHARGING", "FINISHING", "FAULTED", "OFFLINE"],
  FINISHING: ["AVAILABLE", "FAULTED", "OFFLINE"],
  UNAVAILABLE: ["AVAILABLE", "OFFLINE", "FAULTED"],
  FAULTED: ["UNAVAILABLE", "OFFLINE", "AVAILABLE"],
  OFFLINE: ["AVAILABLE", "UNAVAILABLE", "FAULTED"],
};

export function canTransitionChargerStatus(
  from: ChargerOperationalStatus,
  to: ChargerOperationalStatus,
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertChargerStatusTransition(
  from: ChargerOperationalStatus,
  to: ChargerOperationalStatus,
): void {
  if (!canTransitionChargerStatus(from, to)) {
    throw new Error(`Invalid charger status transition: ${from} → ${to}`);
  }
}
