import type {
  ChargerDiagnostics,
  ChargerOperationalStatus,
  ChargerProviderConfig,
  ChargerStatusInfo,
  ConnectorOperationalStatus,
  MeterReading,
  MeterValueCallbackEvent,
  SimulationScenario,
  StatusChangeCallbackEvent,
} from "../types";
import type { ChargerProvider } from "../interfaces/charger-provider.interface";

interface ConnectorRuntime {
  number: number;
  status: ConnectorOperationalStatus;
  maxPowerKw: number;
  sessionId?: string;
  energyKwh: number;
  targetPowerKw: number;
  interval?: ReturnType<typeof setInterval>;
}

interface ChargerRuntime {
  chargerId: string;
  status: ChargerOperationalStatus;
  maxPowerKw: number;
  scenario: SimulationScenario;
  meterIntervalMs: number;
  connectors: Map<number, ConnectorRuntime>;
  connected: boolean;
  lastHeartbeat: Date;
  startedAt: Date;
  errors: string[];
}

type MeterListener = (event: MeterValueCallbackEvent) => void;
type StatusListener = (event: StatusChangeCallbackEvent) => void;

const DEFAULT_METER_INTERVAL_MS = 3000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scenarioPowerFactor(scenario: SimulationScenario): number {
  switch (scenario) {
    case "FAST":
      return 1.0;
    case "SLOW":
      return 0.35;
    case "FAULT":
      return 0.1;
    case "DISCONNECTED":
      return 0;
    default:
      return 0.85;
  }
}

export class MockChargerProvider implements ChargerProvider {
  private readonly chargers = new Map<string, ChargerRuntime>();
  private readonly meterListeners = new Set<MeterListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;

  constructor(private readonly defaultConfig: ChargerProviderConfig = {}) {
    this.heartbeatTimer = setInterval(() => this.tickHeartbeats(), 15_000);
    if (typeof this.heartbeatTimer.unref === "function") {
      this.heartbeatTimer.unref();
    }
  }

  subscribeMeterValues(listener: MeterListener): () => void {
    this.meterListeners.add(listener);
    return () => this.meterListeners.delete(listener);
  }

  subscribeStatusChanges(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async registerCharger(
    chargerId: string,
    config: {
      maxPowerKw: number;
      connectors: Array<{ number: number; maxPowerKw: number; status?: ConnectorOperationalStatus }>;
      scenario?: SimulationScenario;
      meterIntervalMs?: number;
    },
  ): Promise<void> {
    const connectors = new Map<number, ConnectorRuntime>();
    for (const c of config.connectors) {
      connectors.set(c.number, {
        number: c.number,
        status: c.status ?? "available",
        maxPowerKw: c.maxPowerKw,
        energyKwh: 0,
        targetPowerKw: 0,
      });
    }

    const isOnline = config.connectors.some((c) => (c.status ?? "available") !== "unavailable");
    this.chargers.set(chargerId, {
      chargerId,
      status: isOnline ? "available" : "offline",
      maxPowerKw: config.maxPowerKw,
      scenario: config.scenario ?? this.defaultConfig.scenario ?? "NORMAL",
      meterIntervalMs:
        config.meterIntervalMs ?? this.defaultConfig.meterIntervalMs ?? DEFAULT_METER_INTERVAL_MS,
      connectors,
      connected: isOnline,
      lastHeartbeat: new Date(),
      startedAt: new Date(),
      errors: [],
    });
  }

  async connect(chargerId: string): Promise<void> {
    const runtime = this.getRuntime(chargerId);
    if (!runtime.connected) {
      runtime.connected = true;
      this.setChargerStatus(runtime, "available");
      runtime.lastHeartbeat = new Date();
    }
  }

  async disconnect(chargerId: string): Promise<void> {
    const runtime = this.getRuntime(chargerId);
    for (const connector of runtime.connectors.values()) {
      if (connector.interval) {
        clearInterval(connector.interval);
        connector.interval = undefined;
      }
      if (connector.sessionId) {
        connector.sessionId = undefined;
        connector.status = "unavailable";
      }
    }
    runtime.connected = false;
    this.setChargerStatus(runtime, "offline");
  }

  async getStatus(chargerId: string): Promise<ChargerStatusInfo> {
    const runtime = this.getRuntime(chargerId);
    return {
      chargerId,
      status: runtime.status,
      lastHeartbeat: runtime.lastHeartbeat,
      connectors: [...runtime.connectors.values()].map((c) => ({
        connectorId: c.number,
        status: c.status,
        powerKw: c.targetPowerKw,
        sessionId: c.sessionId,
      })),
    };
  }

  async startCharging(chargerId: string, connectorId: number, sessionId: string): Promise<void> {
    const runtime = this.getRuntime(chargerId);
    if (!runtime.connected || runtime.status === "offline") {
      throw new Error(`Charger ${chargerId} is offline`);
    }
    if (runtime.status === "faulted") {
      throw new Error(`Charger ${chargerId} is faulted`);
    }

    const connector = this.getConnector(runtime, connectorId);
    if (connector.status !== "available") {
      throw new Error(`Connector ${connectorId} is not available (${connector.status})`);
    }

    connector.sessionId = sessionId;
    connector.energyKwh = 0;
    connector.status = "preparing";
    this.emitStatus(runtime.chargerId, connector.number, "available", "preparing", sessionId);
    this.setChargerStatus(runtime, "preparing");

    await this.delay(800);

    if (runtime.scenario === "FAULT") {
      connector.status = "faulted";
      connector.sessionId = undefined;
      this.emitStatus(runtime.chargerId, connector.number, "preparing", "faulted", sessionId, "fault");
      this.setChargerStatus(runtime, "faulted");
      throw new Error("Simulated charger fault during start");
    }

    if (runtime.scenario === "DISCONNECTED") {
      runtime.connected = false;
      connector.status = "unavailable";
      connector.sessionId = undefined;
      this.setChargerStatus(runtime, "offline");
      throw new Error("Simulated charger disconnection during start");
    }

    const powerCap = Math.min(runtime.maxPowerKw, connector.maxPowerKw);
    connector.targetPowerKw = powerCap * scenarioPowerFactor(runtime.scenario);
    connector.status = "charging";
    this.emitStatus(runtime.chargerId, connector.number, "preparing", "charging", sessionId);
    this.setChargerStatus(runtime, "charging");

    connector.interval = setInterval(() => {
      this.tickMeter(runtime, connector);
    }, runtime.meterIntervalMs);
    if (typeof connector.interval.unref === "function") {
      connector.interval.unref();
    }
  }

  async stopCharging(chargerId: string, connectorId: number): Promise<void> {
    const runtime = this.getRuntime(chargerId);
    const connector = this.getConnector(runtime, connectorId);

    if (connector.interval) {
      clearInterval(connector.interval);
      connector.interval = undefined;
    }

    const sessionId = connector.sessionId;
    const previous = connector.status;
    connector.targetPowerKw = 0;
    connector.status = "finishing";
    this.emitStatus(runtime.chargerId, connector.number, previous, "finishing", sessionId);
    this.setChargerStatus(runtime, "finishing");

    await this.delay(600);

    connector.status = "available";
    connector.sessionId = undefined;
    this.emitStatus(runtime.chargerId, connector.number, "finishing", "available", sessionId);
    this.refreshChargerAggregateStatus(runtime);
  }

  async getMeterValues(chargerId: string, connectorId: number): Promise<MeterReading> {
    const runtime = this.getRuntime(chargerId);
    const connector = this.getConnector(runtime, connectorId);
    const voltage = 380 + Math.random() * 40;
    const current = connector.targetPowerKw > 0 ? (connector.targetPowerKw * 1000) / voltage : 0;
    return {
      timestamp: new Date(),
      energyKwh: connector.energyKwh,
      powerKw: connector.targetPowerKw,
      voltage,
      current,
      temperature: 28 + connector.energyKwh * 0.05,
    };
  }

  async setAvailability(
    chargerId: string,
    connectorId: number,
    status: ConnectorOperationalStatus,
  ): Promise<void> {
    const runtime = this.getRuntime(chargerId);
    const connector = this.getConnector(runtime, connectorId);
    const previous = connector.status;
    connector.status = status;
    connector.targetPowerKw = 0;
    this.emitStatus(runtime.chargerId, connector.number, previous, status);
    this.refreshChargerAggregateStatus(runtime);
  }

  async restart(chargerId: string): Promise<void> {
    const runtime = this.getRuntime(chargerId);
    runtime.errors = [];
    runtime.connected = true;
    runtime.lastHeartbeat = new Date();
    for (const connector of runtime.connectors.values()) {
      if (!connector.sessionId) {
        connector.status = "available";
      }
    }
    this.setChargerStatus(runtime, "available");
  }

  async getDiagnostics(chargerId: string): Promise<ChargerDiagnostics> {
    const runtime = this.getRuntime(chargerId);
    return {
      chargerId,
      firmwareVersion: "mock-2.0.0",
      uptime: Math.floor((Date.now() - runtime.startedAt.getTime()) / 1000),
      lastHeartbeat: runtime.lastHeartbeat,
      errors: runtime.errors,
      scenario: runtime.scenario,
    };
  }

  async setScenario(chargerId: string, scenario: SimulationScenario): Promise<void> {
    const runtime = this.getRuntime(chargerId);
    runtime.scenario = scenario;
  }

  dispose(): void {
    clearInterval(this.heartbeatTimer);
    for (const runtime of this.chargers.values()) {
      for (const connector of runtime.connectors.values()) {
        if (connector.interval) clearInterval(connector.interval);
      }
    }
    this.chargers.clear();
  }

  private tickMeter(runtime: ChargerRuntime, connector: ConnectorRuntime): void {
    if (!connector.sessionId || connector.status !== "charging") return;

    if (runtime.scenario === "DISCONNECTED") {
      this.handleDisconnect(runtime, connector);
      return;
    }

    if (runtime.scenario === "FAULT" && connector.energyKwh > 1) {
      this.handleFault(runtime, connector);
      return;
    }

    const intervalSec = runtime.meterIntervalMs / 1000;
    const deltaKwh = (connector.targetPowerKw * intervalSec) / 3600;
    connector.energyKwh = Number((connector.energyKwh + deltaKwh).toFixed(4));

    const reading: MeterReading = {
      timestamp: new Date(),
      energyKwh: connector.energyKwh,
      powerKw: connector.targetPowerKw,
      voltage: 380 + Math.random() * 40,
      current:
        connector.targetPowerKw > 0
          ? (connector.targetPowerKw * 1000) / (380 + Math.random() * 40)
          : 0,
      temperature: clamp(28 + connector.energyKwh * 0.08, 28, 65),
    };

    this.meterListeners.forEach((listener) =>
      listener({
        chargerId: runtime.chargerId,
        connectorNumber: connector.number,
        sessionId: connector.sessionId!,
        reading,
      }),
    );
  }

  private handleFault(runtime: ChargerRuntime, connector: ConnectorRuntime): void {
    if (connector.interval) {
      clearInterval(connector.interval);
      connector.interval = undefined;
    }
    runtime.errors.push("Simulated fault during charging");
    connector.status = "faulted";
    connector.targetPowerKw = 0;
    this.emitStatus(
      runtime.chargerId,
      connector.number,
      "charging",
      "faulted",
      connector.sessionId,
      "fault",
    );
    this.setChargerStatus(runtime, "faulted");
  }

  private handleDisconnect(runtime: ChargerRuntime, connector: ConnectorRuntime): void {
    if (connector.interval) {
      clearInterval(connector.interval);
      connector.interval = undefined;
    }
    runtime.connected = false;
    connector.status = "unavailable";
    connector.targetPowerKw = 0;
    this.setChargerStatus(runtime, "offline");
    this.emitStatus(
      runtime.chargerId,
      connector.number,
      "charging",
      "unavailable",
      connector.sessionId,
      "disconnected",
    );
  }

  private tickHeartbeats(): void {
    const now = new Date();
    for (const runtime of this.chargers.values()) {
      if (runtime.connected) runtime.lastHeartbeat = now;
    }
  }

  private setChargerStatus(runtime: ChargerRuntime, status: ChargerOperationalStatus): void {
    const previous = runtime.status;
    if (previous === status) return;
    runtime.status = status;
    this.statusListeners.forEach((listener) =>
      listener({
        chargerId: runtime.chargerId,
        previousStatus: previous,
        status,
      }),
    );
  }

  private refreshChargerAggregateStatus(runtime: ChargerRuntime): void {
    const connectors = [...runtime.connectors.values()];
    if (connectors.some((c) => c.status === "charging")) {
      this.setChargerStatus(runtime, "charging");
      return;
    }
    if (connectors.some((c) => c.status === "preparing" || c.status === "finishing")) {
      this.setChargerStatus(
        runtime,
        connectors.some((c) => c.status === "preparing") ? "preparing" : "finishing",
      );
      return;
    }
    if (!runtime.connected) {
      this.setChargerStatus(runtime, "offline");
      return;
    }
    if (connectors.every((c) => c.status === "faulted")) {
      this.setChargerStatus(runtime, "faulted");
      return;
    }
    this.setChargerStatus(runtime, "available");
  }

  private emitStatus(
    chargerId: string,
    connectorNumber: number,
    previous: string,
    status: string,
    sessionId?: string,
    reason?: string,
  ): void {
    this.statusListeners.forEach((listener) =>
      listener({
        chargerId,
        connectorNumber,
        sessionId,
        previousStatus: previous,
        status,
        reason,
      }),
    );
  }

  private getRuntime(chargerId: string): ChargerRuntime {
    const runtime = this.chargers.get(chargerId);
    if (!runtime) {
      throw new Error(`Charger ${chargerId} is not registered in MockChargerProvider`);
    }
    return runtime;
  }

  private getConnector(runtime: ChargerRuntime, connectorId: number): ConnectorRuntime {
    const connector = runtime.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found on charger ${runtime.chargerId}`);
    }
    return connector;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
