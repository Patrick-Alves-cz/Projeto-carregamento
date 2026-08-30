import type { ChargerProvider } from "../interfaces/charger-provider.interface";
import type {
  ChargerDiagnostics,
  ChargerStatusInfo,
  ConnectorAvailabilityStatus,
  MeterReading,
} from "../types";

/**
 * Mock implementation for development and demo.
 * Full simulation logic will be implemented in Phase 2.
 */
export class MockChargerProvider implements ChargerProvider {
  async connect(_chargerId: string): Promise<void> {
    throw new Error("MockChargerProvider.connect() not implemented yet");
  }

  async disconnect(_chargerId: string): Promise<void> {
    throw new Error("MockChargerProvider.disconnect() not implemented yet");
  }

  async getStatus(_chargerId: string): Promise<ChargerStatusInfo> {
    throw new Error("MockChargerProvider.getStatus() not implemented yet");
  }

  async startCharging(
    _chargerId: string,
    _connectorId: number,
    _sessionId: string,
  ): Promise<void> {
    throw new Error("MockChargerProvider.startCharging() not implemented yet");
  }

  async stopCharging(_chargerId: string, _connectorId: number): Promise<void> {
    throw new Error("MockChargerProvider.stopCharging() not implemented yet");
  }

  async getMeterValues(_chargerId: string, _connectorId: number): Promise<MeterReading> {
    throw new Error("MockChargerProvider.getMeterValues() not implemented yet");
  }

  async setAvailability(
    _chargerId: string,
    _connectorId: number,
    _status: ConnectorAvailabilityStatus,
  ): Promise<void> {
    throw new Error("MockChargerProvider.setAvailability() not implemented yet");
  }

  async restart(_chargerId: string): Promise<void> {
    throw new Error("MockChargerProvider.restart() not implemented yet");
  }

  async getDiagnostics(_chargerId: string): Promise<ChargerDiagnostics> {
    throw new Error("MockChargerProvider.getDiagnostics() not implemented yet");
  }
}
