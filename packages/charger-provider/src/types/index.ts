export type ChargerStatus = "online" | "offline" | "faulted";

export type ConnectorAvailabilityStatus =
  | "available"
  | "occupied"
  | "unavailable"
  | "faulted";

export type ChargerProviderType = "mock" | "ocpp16" | "ocpp201" | "ocpp21";

export interface MeterReading {
  timestamp: Date;
  energyKwh: number;
  powerKw: number;
  voltage?: number;
  current?: number;
}

export interface ChargerDiagnostics {
  chargerId: string;
  firmwareVersion?: string;
  uptime?: number;
  lastHeartbeat?: Date;
  errors: string[];
}

export interface ConnectorStatusInfo {
  connectorId: number;
  status: ConnectorAvailabilityStatus;
  powerKw: number;
}

export interface ChargerStatusInfo {
  chargerId: string;
  status: ChargerStatus;
  connectors: ConnectorStatusInfo[];
}
