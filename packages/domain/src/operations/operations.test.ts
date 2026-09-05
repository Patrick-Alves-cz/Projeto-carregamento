import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { communicationFreshness } from "./freshness";
import { calculateChargerHealth } from "./health";
import { calculateReliabilityScore } from "./reliability";
import { deriveStationAvailability } from "./availability";
import { estimateWaitMinutes } from "./wait-time";
import { detectMeteringAnomaly } from "./metering";
import { sessionVisualState } from "./driver-errors";

describe("communication freshness", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  it("marks live when connected and recent", () => {
    assert.equal(
      communicationFreshness({
        connected: true,
        lastMessageAt: new Date(now.getTime() - 20_000),
        now,
      }),
      "LIVE",
    );
  });
  it("marks stale then offline", () => {
    assert.equal(
      communicationFreshness({
        connected: false,
        lastMessageAt: new Date(now.getTime() - 10 * 60_000),
        now,
      }),
      "STALE",
    );
    assert.equal(
      communicationFreshness({
        connected: false,
        lastMessageAt: new Date(now.getTime() - 20 * 60_000),
        now,
      }),
      "OFFLINE",
    );
  });
});

describe("charger health", () => {
  const base = {
    chargerStatus: "AVAILABLE",
    connectorStatuses: ["AVAILABLE", "AVAILABLE"],
    inMaintenance: false,
    connected: true,
    lastMessageAt: new Date(),
    reconnectCount24h: 0,
    failedCommands1h: 0,
    sessionFailures1h: 0,
    sessionStarts1h: 0,
    openHighIncidents: 0,
    pendingReconciliation: false,
  };
  it("is healthy when live and no faults", () => {
    assert.equal(calculateChargerHealth(base).status, "HEALTHY");
  });
  it("is offline when stale long enough", () => {
    assert.equal(
      calculateChargerHealth({
        ...base,
        connected: false,
        chargerStatus: "OFFLINE",
        lastMessageAt: new Date(Date.now() - 20 * 60_000),
      }).status,
      "OFFLINE",
    );
  });
  it("is faulted when charger faulted", () => {
    assert.equal(calculateChargerHealth({ ...base, chargerStatus: "FAULTED" }).status, "FAULTED");
  });
  it("is degraded when communication is stale", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    assert.equal(
      calculateChargerHealth({
        ...base,
        connected: true,
        lastMessageAt: new Date(now.getTime() - 10 * 60_000),
        now,
      }).status,
      "DEGRADED",
    );
  });
  it("is maintenance when window is active", () => {
    assert.equal(calculateChargerHealth({ ...base, inMaintenance: true }).status, "MAINTENANCE");
  });
});

describe("reliability score", () => {
  it("scores successful uptime and sessions highly", () => {
    const result = calculateReliabilityScore({
      uptimeMinutes: 1440,
      windowMinutes: 1440,
      sessionsStarted: 10,
      sessionsCompleted: 10,
      sessionsFailed: 0,
      commandsSent: 10,
      commandsSucceeded: 10,
      remoteStartFailures: 0,
      remoteStopFailures: 0,
      connectorFaultEvents: 0,
      offlineEvents: 0,
      recoveredEvents: 0,
    });
    assert.equal(result.score, 100);
  });
  it("penalizes failed sessions and downtime", () => {
    const result = calculateReliabilityScore({
      uptimeMinutes: 720,
      windowMinutes: 1440,
      sessionsStarted: 10,
      sessionsCompleted: 5,
      sessionsFailed: 5,
      commandsSent: 10,
      commandsSucceeded: 5,
      remoteStartFailures: 3,
      remoteStopFailures: 1,
      connectorFaultEvents: 2,
      offlineEvents: 4,
      recoveredEvents: 1,
    });
    assert.ok(result.score < 50);
  });
});

describe("station availability", () => {
  it("is available with mixed connectors if some are free", () => {
    assert.equal(
      deriveStationAvailability({
        total: 5,
        available: 2,
        occupied: 1,
        reserved: 1,
        faulted: 1,
        offline: 0,
      }),
      "AVAILABLE",
    );
  });
  it("is busy when none are free and occupied", () => {
    assert.equal(
      deriveStationAvailability({
        total: 4,
        available: 0,
        occupied: 4,
        reserved: 0,
        faulted: 0,
        offline: 0,
      }),
      "BUSY",
    );
  });
  it("is offline when all chargers are offline", () => {
    assert.equal(
      deriveStationAvailability({
        total: 3,
        available: 0,
        occupied: 0,
        reserved: 0,
        faulted: 0,
        offline: 3,
      }),
      "OFFLINE",
    );
  });
});

describe("wait time", () => {
  it("returns now when a compatible connector is free", () => {
    const eta = estimateWaitMinutes({
      compatibleConnectors: 2,
      availableNow: 1,
      queueAhead: 0,
      remainingSessionMinutes: [20],
      averageSessionMinutes: 25,
    });
    assert.equal(eta.minutes, 0);
  });
  it("uses remaining session time for station queues", () => {
    const eta = estimateWaitMinutes({
      compatibleConnectors: 1,
      availableNow: 0,
      queueAhead: 0,
      remainingSessionMinutes: [12],
      averageSessionMinutes: 25,
    });
    assert.equal(eta.label, "~20 min");
  });
});

describe("metering anomalies", () => {
  it("detects regression and spikes without blocking", () => {
    assert.equal(
      detectMeteringAnomaly({ previousEnergyKwh: 10, energyKwh: 9.2, powerKw: 40 }),
      "ENERGY_REGRESSION",
    );
    assert.equal(
      detectMeteringAnomaly({ previousEnergyKwh: 1, energyKwh: 60, powerKw: 40 }),
      "ENERGY_SPIKE",
    );
  });
});

describe("session visual billing states", () => {
  it("keeps payment language driver-facing", () => {
    assert.equal(sessionVisualState({ status: "ACTIVE" }).label, "Carregando");
    assert.equal(
      sessionVisualState({ status: "COMPLETED", billingStatus: "CAPTURED" }).label,
      "Pagamento concluído",
    );
    assert.equal(
      sessionVisualState({ status: "COMPLETED", billingStatus: "PAYMENT_FAILED" }).label,
      "Pagamento falhou",
    );
  });
});
