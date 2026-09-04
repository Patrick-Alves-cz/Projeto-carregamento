import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChargerProviderFactory } from "./charger-provider.factory";
import { MockChargerProvider } from "../mock/mock-charger-provider";
import { OcppChargerProvider } from "../ocpp/ocpp-charger-provider";

describe("ChargerProviderFactory", () => {
  it("creates MockChargerProvider for mock type", () => {
    ChargerProviderFactory.resetMockInstance();
    const provider = ChargerProviderFactory.create("mock");
    assert.ok(provider instanceof MockChargerProvider);
    ChargerProviderFactory.resetMockInstance();
  });

  it("creates OcppChargerProvider for ocpp16 when a command port is provided", () => {
    const port = {
      isOnline: () => true,
      remoteStart: async () => true,
      remoteStop: async () => true,
      reset: async () => true,
      changeAvailability: async () => true,
    };
    const provider = ChargerProviderFactory.create("ocpp16", { commandPort: port });
    assert.ok(provider instanceof OcppChargerProvider);
  });

  it("throws for unimplemented OCPP 2.x types", () => {
    assert.throws(
      () => ChargerProviderFactory.create("ocpp201"),
      /not implemented yet/,
    );
  });
});
