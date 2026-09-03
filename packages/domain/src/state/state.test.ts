import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canTransitionChargerStatus, assertChargerStatusTransition } from "./charger-status";
import { canTransitionConnectorStatus, assertConnectorStatusTransition } from "./connector-status";
import {
  canTransitionSessionStatus,
  isSessionTerminal,
  assertSessionStatusTransition,
} from "./session-status";
import { calculateCostCents } from "../finance/cost-calculator";
import { InvalidStateTransitionError } from "../errors";

describe("charger status transitions", () => {
  it("allows AVAILABLE → PREPARING", () => {
    assert.equal(canTransitionChargerStatus("AVAILABLE", "PREPARING"), true);
  });

  it("blocks OFFLINE → CHARGING", () => {
    assert.equal(canTransitionChargerStatus("OFFLINE", "CHARGING"), false);
    assert.throws(
      () => assertChargerStatusTransition("OFFLINE", "CHARGING"),
      InvalidStateTransitionError,
    );
  });
});

describe("connector status transitions", () => {
  it("allows AVAILABLE → PREPARING → CHARGING", () => {
    assert.equal(canTransitionConnectorStatus("AVAILABLE", "PREPARING"), true);
    assert.equal(canTransitionConnectorStatus("PREPARING", "CHARGING"), true);
  });

  it("blocks AVAILABLE → CHARGING", () => {
    assert.equal(canTransitionConnectorStatus("AVAILABLE", "CHARGING"), false);
    assert.throws(
      () => assertConnectorStatusTransition("AVAILABLE", "CHARGING"),
      InvalidStateTransitionError,
    );
  });
});

describe("session status transitions", () => {
  it("blocks COMPLETED → ACTIVE", () => {
    assert.equal(canTransitionSessionStatus("COMPLETED", "ACTIVE"), false);
    assert.throws(
      () => assertSessionStatusTransition("COMPLETED", "ACTIVE"),
      InvalidStateTransitionError,
    );
  });

  it("allows PENDING → PREPARING → ACTIVE", () => {
    assert.equal(canTransitionSessionStatus("PENDING", "PREPARING"), true);
    assert.equal(canTransitionSessionStatus("PREPARING", "ACTIVE"), true);
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
