import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MessageType,
  OcppProtocolError,
  isCall,
  mapOcppConnectorStatus,
  parseOcppFrame,
  serializeCall,
  serializeCallResult,
  toWh,
  whToKwh,
} from "./index";

describe("OCPP framing", () => {
  it("parses a valid CALL", () => {
    const raw = serializeCall("abc", "Heartbeat", {});
    const frame = parseOcppFrame(raw);
    assert.equal(isCall(frame), true);
    if (isCall(frame)) {
      assert.equal(frame[0], MessageType.CALL);
      assert.equal(frame[2], "Heartbeat");
    }
  });

  it("rejects malformed JSON", () => {
    assert.throws(() => parseOcppFrame("{nope"), OcppProtocolError);
  });

  it("serializes CALLRESULT", () => {
    const raw = serializeCallResult("1", { currentTime: "2026-01-01T00:00:00Z" });
    const frame = parseOcppFrame(raw);
    assert.equal(frame[0], MessageType.CALLRESULT);
  });
});

describe("OCPP mappers", () => {
  it("maps connector statuses", () => {
    assert.equal(mapOcppConnectorStatus("Available"), "available");
    assert.equal(mapOcppConnectorStatus("SuspendedEV"), "suspended");
    assert.equal(mapOcppConnectorStatus("SuspendedEVSE", "HighTemperature"), "faulted");
    assert.equal(mapOcppConnectorStatus("Unknown"), "unavailable");
  });

  it("converts energy units", () => {
    assert.equal(toWh(1.5, "kWh"), 1500);
    assert.equal(whToKwh(1890), 1.89);
  });
});
