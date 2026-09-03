import type {
  ChargerDiagnostics,
  ChargerStatusInfo,
  ConnectorOperationalStatus,
  MeterReading,
} from "../types";

export interface ChargerProvider {
  connect(chargerId: string): Promise<void>;
  disconnect(chargerId: string): Promise<void>;
  getStatus(chargerId: string): Promise<ChargerStatusInfo>;
  startCharging(
    chargerId: string,
    connectorId: number,
    sessionId: string,
  ): Promise<void>;
  stopCharging(chargerId: string, connectorId: number): Promise<void>;
  pauseCharging(chargerId: string, connectorId: number): Promise<void>;
  resumeCharging(chargerId: string, connectorId: number): Promise<void>;
  getMeterValues(chargerId: string, connectorId: number): Promise<MeterReading>;
  setAvailability(
    chargerId: string,
    connectorId: number,
    status: ConnectorOperationalStatus,
  ): Promise<void>;
  restart(chargerId: string): Promise<void>;
  getDiagnostics(chargerId: string): Promise<ChargerDiagnostics>;
}
