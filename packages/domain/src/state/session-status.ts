export const SESSION_STATUSES = [
  "PENDING",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type SessionOperationalStatus = (typeof SESSION_STATUSES)[number];

const VALID_TRANSITIONS: Record<SessionOperationalStatus, SessionOperationalStatus[]> = {
  PENDING: ["ACTIVE", "FAILED", "CANCELLED"],
  ACTIVE: ["PAUSED", "COMPLETED", "FAILED", "CANCELLED"],
  PAUSED: ["ACTIVE", "COMPLETED", "FAILED", "CANCELLED"],
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
    throw new Error(`Invalid session status transition: ${from} → ${to}`);
  }
}

export function isSessionTerminal(status: SessionOperationalStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
}

export function isSessionActive(status: SessionOperationalStatus): boolean {
  return status === "ACTIVE" || status === "PAUSED" || status === "PENDING";
}
