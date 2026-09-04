import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serializeCall, parseOcppFrame, isCall } from "@evcharge/ocpp";

describe("OCPP simulator framing", () => {
  it("builds a BootNotification CALL", () => {
    const raw = serializeCall("1", "BootNotification", {
      chargePointVendor: "EVCharge",
      chargePointModel: "Sim16",
    });
    const frame = parseOcppFrame(raw);
    assert.equal(isCall(frame), true);
    if (isCall(frame)) assert.equal(frame[2], "BootNotification");
  });
});
