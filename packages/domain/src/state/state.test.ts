import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canTransitionChargerStatus } from "./charger-status";
import { canTransitionConnectorStatus } from "./connector-status";
import { canTransitionSessionStatus, isSessionTerminal } from "./session-status";
import { calculateCostCents } from "../finance/cost-calculator";

describe("charger status transitions", () => {
  it("allows AVAILABLE → PREPARING", () => {
    assert.equal(canTransitionChargerStatus("AVAILABLE", "PREPARING"), true);
  });

  it("blocks OFFLINE → CHARGING", () => {
    assert.equal(canTransitionChargerStatus("OFFLINE", "CHARGING"), false);
  });
});

describe("connector status transitions", () => {
  it("allows AVAILABLE → PREPARING → CHARGING", () => {
    assert.equal(canTransitionConnectorStatus("AVAILABLE", "PREPARING"), true);
    assert.equal(canTransitionConnectorStatus("PREPARING", "CHARGING"), true);
  });
});

describe("session status transitions", () => {
  it("blocks COMPLETED → ACTIVE", () => {
    assert.equal(canTransitionSessionStatus("COMPLETED", "ACTIVE"), false);
  });

  it("marks terminal states", () => {
    assert.equal(isSessionTerminal("COMPLETED"), true);
    assert.equal(isSessionTerminal("ACTIVE"), false);
  });
});

describe("calculateCostCents", () => {
  it("calculates R$ 19,69 for 10.42 kWh at R$ 1,89/kWh", () => {
    assert.equal(calculateCostCents(10.42, 189), 1969);
  });

  it("returns 0 for zero energy", () => {
    assert.equal(calculateCostCents(0, 189), 0);
  });
});
