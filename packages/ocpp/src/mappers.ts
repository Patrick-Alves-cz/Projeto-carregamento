export type MappedConnectorStatus =
  | "available"
  | "preparing"
  | "charging"
  | "suspended"
  | "finishing"
  | "unavailable"
  | "faulted";

export type MappedChargerStatus = MappedConnectorStatus | "offline";

const CONNECTOR_MAP: Record<string, MappedConnectorStatus> = {
  Available: "available",
  Preparing: "preparing",
  Charging: "charging",
  SuspendedEV: "suspended",
  SuspendedEVSE: "suspended",
  Finishing: "finishing",
  Reserved: "unavailable",
  Unavailable: "unavailable",
  Faulted: "faulted",
};

export function mapOcppConnectorStatus(status: string, errorCode?: string): MappedConnectorStatus {
  if (status === "SuspendedEVSE" && errorCode && errorCode !== "NoError") {
    return "faulted";
  }
  return CONNECTOR_MAP[status] ?? "unavailable";
}

export function mapOcppConnectorToChargerStatus(
  connectorStatus: MappedConnectorStatus,
  connected: boolean,
): MappedChargerStatus {
  if (!connected) return "offline";
  if (connectorStatus === "faulted") return "faulted";
  if (connectorStatus === "charging") return "charging";
  if (connectorStatus === "preparing") return "preparing";
  if (connectorStatus === "finishing") return "finishing";
  if (connectorStatus === "suspended") return "suspended";
  if (connectorStatus === "unavailable") return "unavailable";
  return "available";
}

export function parseMeasurand(
  measurand: string | undefined,
): "energy" | "power" | "voltage" | "current" | "soc" | "unknown" {
  if (!measurand || measurand === "Energy.Active.Import.Register") return "energy";
  if (measurand === "Power.Active.Import") return "power";
  if (measurand === "Voltage") return "voltage";
  if (measurand === "Current.Import" || measurand === "Current.Offered") return "current";
  if (measurand === "SoC") return "soc";
  return "unknown";
}

export function toWh(value: number, unit?: string): number {
  const normalized = unit?.toLowerCase();
  if (normalized === "kwh") return Math.round(value * 1000);
  return Math.round(value);
}

export function toW(value: number, unit?: string): number {
  const normalized = unit?.toLowerCase();
  if (normalized === "kw") return Math.round(value * 1000);
  return Math.round(value);
}

export function whToKwh(wh: number): number {
  return Number((wh / 1000).toFixed(4));
}

export function wToKw(w: number): number {
  return Number((w / 1000).toFixed(2));
}
