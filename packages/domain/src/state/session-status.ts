import { InvalidStateTransitionError } from "../errors";

export const SESSION_STATUSES = [
  "PENDING",
  "PREPARING",
  "ACTIVE",
  "PAUSED",
  "CHARGING_COMPLETE",
  "IDLE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type SessionOperationalStatus = (typeof SESSION_STATUSES)[number];

const VALID_TRANSITIONS: Record<SessionOperationalStatus, SessionOperationalStatus[]> = {
  PENDING: ["PREPARING", "ACTIVE", "FAILED", "CANCELLED"],
  PREPARING: ["ACTIVE", "FAILED", "CANCELLED"],
  ACTIVE: ["PAUSED", "CHARGING_COMPLETE", "IDLE", "COMPLETED", "FAILED", "CANCELLED"],
  PAUSED: ["ACTIVE", "CHARGING_COMPLETE", "COMPLETED", "FAILED", "CANCELLED"],
  CHARGING_COMPLETE: ["IDLE", "COMPLETED", "FAILED", "CANCELLED"],
  IDLE: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionSessionStatus(
  from: SessionOperationalStatus,
  to: SessionOperationalStatus,
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertSessionStatusTransition(
  from: SessionOperationalStatus,
  to: SessionOperationalStatus,
): void {
  if (!canTransitionSessionStatus(from, to)) {
    throw new InvalidStateTransitionError("session", from, to);
  }
}

export function isSessionTerminal(status: SessionOperationalStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
}

export function isSessionActive(status: SessionOperationalStatus): boolean {
  return (
    status === "ACTIVE" ||
    status === "PAUSED" ||
    status === "PENDING" ||
    status === "PREPARING" ||
    status === "CHARGING_COMPLETE" ||
    status === "IDLE"
  );
}

export const ACTIVE_SESSION_STATUSES = [
  "PENDING",
  "PREPARING",
  "ACTIVE",
  "PAUSED",
  "CHARGING_COMPLETE",
  "IDLE",
] as const satisfies readonly SessionOperationalStatus[];
