import { InvalidStateTransitionError } from "../errors";

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
  PREPARING: ["CHARGING", "AVAILABLE", "FAULTED", "UNAVAILABLE"],
  CHARGING: ["SUSPENDED", "FINISHING", "FAULTED", "UNAVAILABLE", "AVAILABLE"],
  SUSPENDED: ["CHARGING", "FINISHING", "FAULTED", "UNAVAILABLE", "AVAILABLE"],
  FINISHING: ["AVAILABLE", "FAULTED", "UNAVAILABLE"],
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
    throw new InvalidStateTransitionError("connector", from, to);
  }
}
