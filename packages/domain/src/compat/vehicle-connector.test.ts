import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertVehicleConnectorCompatibility,
  isVehicleCompatibleWithConnector,
} from "./vehicle-connector";
import { ValidationError } from "../errors";

describe("vehicle × connector compatibility", () => {
  it("allows CCS2 × CCS2", () => {
    assert.equal(isVehicleCompatibleWithConnector(["CCS2"], "CCS2"), true);
    assert.doesNotThrow(() => assertVehicleConnectorCompatibility(["CCS2"], "CCS2"));
  });

  it("blocks CCS2 × TYPE2", () => {
    assert.equal(isVehicleCompatibleWithConnector(["CCS2"], "TYPE2"), false);
    assert.throws(
      () => assertVehicleConnectorCompatibility(["CCS2"], "TYPE2"),
      (error: unknown) =>
        error instanceof ValidationError &&
        error.message === "Veículo incompatível com este conector.",
    );
  });

  it("allows TYPE2 × TYPE2", () => {
    assert.equal(isVehicleCompatibleWithConnector(["TYPE2"], "TYPE2"), true);
  });
});
