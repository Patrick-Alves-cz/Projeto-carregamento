export type ChargerOperationalStatus =
  | "available"
  | "preparing"
  | "charging"
  | "suspended"
  | "finishing"
  | "unavailable"
  | "faulted"
  | "offline";

export type ConnectorOperationalStatus =
  | "available"
  | "preparing"
  | "charging"
  | "suspended"
  | "finishing"
  | "unavailable"
  | "faulted";

export type SimulationScenario = "NORMAL" | "FAST" | "SLOW" | "FAULT" | "DISCONNECTED";

export type ChargerProviderType = "mock" | "ocpp16" | "ocpp201" | "ocpp21";

export interface MeterReading {
  timestamp: Date;
  energyKwh: number;
  powerKw: number;
  voltage?: number;
  current?: number;
  temperature?: number;
}

export interface ChargerDiagnostics {
  chargerId: string;
  firmwareVersion?: string;
  uptime?: number;
  lastHeartbeat?: Date;
  errors: string[];
  scenario?: SimulationScenario;
}

export interface ConnectorStatusInfo {
  connectorId: number;
  status: ConnectorOperationalStatus;
  powerKw: number;
  sessionId?: string;
}

export interface ChargerStatusInfo {
  chargerId: string;
  status: ChargerOperationalStatus;
  connectors: ConnectorStatusInfo[];
  lastHeartbeat?: Date;
}

export interface ChargerProviderConfig {
  meterIntervalMs?: number;
  scenario?: SimulationScenario;
  maxPowerKw?: number;
}

export interface MeterValueCallbackEvent {
  chargerId: string;
  connectorNumber: number;
  sessionId: string;
  reading: MeterReading;
}

export interface StatusChangeCallbackEvent {
  chargerId: string;
  connectorNumber?: number;
  sessionId?: string;
  previousStatus: string;
  status: string;
  reason?: string;
}
