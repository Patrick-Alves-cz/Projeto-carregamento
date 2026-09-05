import {
  communicationFreshness,
  type CommunicationFreshness,
} from "./freshness";

export const CHARGER_HEALTH_STATUSES = [
  "HEALTHY",
  "DEGRADED",
  "UNSTABLE",
  "OFFLINE",
  "FAULTED",
  "MAINTENANCE",
] as const;
export type ChargerHealthStatus = (typeof CHARGER_HEALTH_STATUSES)[number];

export type ChargerHealthInput = {
  chargerStatus: string;
  connectorStatuses: string[];
  inMaintenance: boolean;
  connected: boolean;
  lastMessageAt?: Date | null;
  lastHeartbeatAt?: Date | null;
  lastSeenAt?: Date | null;
  reconnectCount24h: number;
  failedCommands1h: number;
  sessionFailures1h: number;
  sessionStarts1h: number;
  openHighIncidents: number;
  pendingReconciliation: boolean;
  now?: Date;
};

export type ChargerHealthResult = {
  status: ChargerHealthStatus;
  freshness: CommunicationFreshness;
  reasons: string[];
};

export function calculateChargerHealth(input: ChargerHealthInput): ChargerHealthResult {
  const freshness = communicationFreshness(input);
  const reasons: string[] = [];
  const connectors = input.connectorStatuses;
  const faulted = connectors.filter((status) => status === "FAULTED").length;
  const allFaulted = connectors.length > 0 && faulted === connectors.length;

  if (input.inMaintenance) {
    reasons.push("maintenance_window");
    return { status: "MAINTENANCE", freshness, reasons };
  }
  if (freshness === "OFFLINE" || input.chargerStatus === "OFFLINE") {
    reasons.push("offline");
    return { status: "OFFLINE", freshness, reasons };
  }
  if (input.chargerStatus === "FAULTED" || allFaulted) {
    reasons.push("faulted");
    return { status: "FAULTED", freshness, reasons };
  }

  const failureRate =
    input.sessionStarts1h > 0 ? input.sessionFailures1h / input.sessionStarts1h : 0;
  if (
    input.reconnectCount24h >= 5 ||
    input.failedCommands1h >= 3 ||
    (input.sessionStarts1h >= 3 && failureRate >= 0.5)
  ) {
    reasons.push("unstable_signals");
    return { status: "UNSTABLE", freshness, reasons };
  }

  if (
    freshness === "STALE" ||
    faulted > 0 ||
    input.openHighIncidents > 0 ||
    input.failedCommands1h > 0 ||
    input.pendingReconciliation
  ) {
    if (freshness === "STALE") reasons.push("stale_communication");
    if (faulted > 0) reasons.push("partial_fault");
    if (input.pendingReconciliation) reasons.push("pending_reconciliation");
    return { status: "DEGRADED", freshness, reasons };
  }

  return { status: "HEALTHY", freshness, reasons };
}

export function healthDriverLabel(status: ChargerHealthStatus): string {
  if (status === "HEALTHY") return "Muito confiável";
  if (status === "DEGRADED") return "Funcionando com restrições";
  if (status === "UNSTABLE") return "Instável";
  if (status === "MAINTENANCE") return "Em manutenção";
  if (status === "FAULTED") return "Com falha";
  return "Temporariamente indisponível";
}

export function healthDriverHint(status: ChargerHealthStatus): string {
  if (status === "HEALTHY") return "Operando normalmente.";
  if (status === "DEGRADED") return "Alguns conectores podem estar limitados.";
  if (status === "UNSTABLE") return "Algumas falhas foram detectadas recentemente.";
  if (status === "MAINTENANCE") return "Temporariamente indisponível para manutenção.";
  if (status === "FAULTED") return "Este conector apresentou uma falha. Escolha outro disponível.";
  return "Este carregador está temporariamente indisponível.";
}
