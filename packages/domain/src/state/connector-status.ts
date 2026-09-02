export const CONNECTOR_STATUSES = [
  "AVAILABLE",
  "PREPARING",
  "CHARGING",
  "SUSPENDED",
  "FINISHING",
  "UNAVAILABLE",
  "FAULTED",
] as const;

export type ConnectorOperationalStatus = (typeof CONNECTOR_STATUSES)[number];

const VALID_TRANSITIONS: Record<ConnectorOperationalStatus, ConnectorOperationalStatus[]> = {
  AVAILABLE: ["PREPARING", "UNAVAILABLE", "FAULTED"],
  PREPARING: ["CHARGING", "AVAILABLE", "FAULTED"],
  CHARGING: ["SUSPENDED", "FINISHING", "FAULTED"],
  SUSPENDED: ["CHARGING", "FINISHING", "FAULTED"],
  FINISHING: ["AVAILABLE", "FAULTED"],
  UNAVAILABLE: ["AVAILABLE", "FAULTED"],
  FAULTED: ["UNAVAILABLE", "AVAILABLE"],
};

export function canTransitionConnectorStatus(
  from: ConnectorOperationalStatus,
  to: ConnectorOperationalStatus,
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertConnectorStatusTransition(
  from: ConnectorOperationalStatus,
  to: ConnectorOperationalStatus,
): void {
  if (!canTransitionConnectorStatus(from, to)) {
    throw new Error(`Invalid connector status transition: ${from} → ${to}`);
  }
}
