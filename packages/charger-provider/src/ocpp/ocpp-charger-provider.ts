import type { CommandOutcome, OcppCommandPort } from "../interfaces/ocpp-command-port";
import type { ChargerProvider } from "../interfaces/charger-provider.interface";
import type {
  ChargerDiagnostics,
  ChargerStatusInfo,
  ConnectorOperationalStatus,
  MeterReading,
} from "../types";

export class OcppChargerProvider implements ChargerProvider {
  constructor(private readonly commands: OcppCommandPort) {}

  async connect(_chargerId: string): Promise<void> {
    // Physical chargers connect inbound over OCPP WebSocket.
  }

  async disconnect(_chargerId: string): Promise<void> {
    // Connection lifecycle is owned by the OCPP gateway.
  }

  async getStatus(chargerId: string): Promise<ChargerStatusInfo> {
    return {
      chargerId,
      status: this.commands.isOnline(chargerId) ? "available" : "offline",
      connectors: [],
    };
  }

  async startCharging(
    chargerId: string,
    connectorId: number,
    sessionId: string,
    options?: { idTag?: string },
  ): Promise<CommandOutcome> {
    if (!this.commands.isOnline(chargerId)) {
      throw new Error(`Charger ${chargerId} is offline`);
    }
    const idTag = options?.idTag ?? sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(-20);
    const accepted = await this.commands.remoteStart(chargerId, connectorId, idTag);
    if (!accepted) {
      throw new Error("RemoteStartTransaction rejected");
    }
    return { deferred: true };
  }

  async stopCharging(chargerId: string, connectorId: number): Promise<CommandOutcome> {
    const transactionId = await this.commands.lookupTransactionId?.(chargerId, connectorId);
    if (transactionId == null) {
      throw new Error("No OCPP transaction to stop");
    }
    const accepted = await this.commands.remoteStop(chargerId, transactionId);
    if (!accepted) {
      throw new Error("RemoteStopTransaction rejected");
    }
    return { deferred: true };
  }

  async pauseCharging(_chargerId: string, _connectorId: number): Promise<void> {
    // OCPP 1.6 has no RemotePause. Session pause is handled in the domain.
  }

  async resumeCharging(_chargerId: string, _connectorId: number): Promise<void> {
    // OCPP 1.6 has no RemoteResume. Session resume is handled in the domain.
  }

  async getMeterValues(_chargerId: string, _connectorId: number): Promise<MeterReading> {
    return { timestamp: new Date(), energyKwh: 0, powerKw: 0 };
  }

  async setAvailability(
    chargerId: string,
    connectorId: number,
    status: ConnectorOperationalStatus,
  ): Promise<void> {
    const type = status === "unavailable" || status === "faulted" ? "Inoperative" : "Operative";
    const accepted = await this.commands.changeAvailability(chargerId, connectorId, type);
    if (!accepted) throw new Error("ChangeAvailability rejected");
  }

  async restart(chargerId: string): Promise<void> {
    const accepted = await this.commands.reset(chargerId, "Soft");
    if (!accepted) throw new Error("Reset rejected");
  }

  async getDiagnostics(chargerId: string): Promise<ChargerDiagnostics> {
    return {
      chargerId,
      firmwareVersion: undefined,
      lastHeartbeat: undefined,
      errors: this.commands.isOnline(chargerId) ? [] : ["offline"],
    };
  }
}
