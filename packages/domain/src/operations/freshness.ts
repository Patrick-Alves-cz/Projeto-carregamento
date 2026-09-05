export const COMMUNICATION_FRESHNESS = ["LIVE", "RECENT", "STALE", "OFFLINE"] as const;
export type CommunicationFreshness = (typeof COMMUNICATION_FRESHNESS)[number];

export const FRESHNESS_LIVE_MS = 90_000;
export const FRESHNESS_RECENT_MS = 5 * 60_000;
export const FRESHNESS_STALE_MS = 15 * 60_000;

export function communicationFreshness(input: {
  connected: boolean;
  lastMessageAt?: Date | null;
  lastHeartbeatAt?: Date | null;
  lastSeenAt?: Date | null;
  now?: Date;
}): CommunicationFreshness {
  const now = input.now ?? new Date();
  const stamp = input.lastMessageAt ?? input.lastHeartbeatAt ?? input.lastSeenAt ?? null;
  if (input.connected && stamp && now.getTime() - stamp.getTime() <= FRESHNESS_LIVE_MS) {
    return "LIVE";
  }
  if (!stamp) return input.connected ? "RECENT" : "OFFLINE";
  const age = now.getTime() - stamp.getTime();
  if (age <= FRESHNESS_RECENT_MS) return "RECENT";
  if (age <= FRESHNESS_STALE_MS) return "STALE";
  return "OFFLINE";
}

export function freshnessDriverLabel(value: CommunicationFreshness): string {
  if (value === "LIVE") return "Atualizado agora";
  if (value === "RECENT") return "Atualizado recentemente";
  if (value === "STALE") return "Comunicação atrasada";
  return "Sem comunicação";
}
