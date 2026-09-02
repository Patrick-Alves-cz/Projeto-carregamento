import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChargerProviderFactory } from "./charger-provider.factory";
import { MockChargerProvider } from "../mock/mock-charger-provider";

describe("ChargerProviderFactory", () => {
  it("creates MockChargerProvider for mock type", () => {
    ChargerProviderFactory.resetMockInstance();
    const provider = ChargerProviderFactory.create("mock");
    assert.ok(provider instanceof MockChargerProvider);
    ChargerProviderFactory.resetMockInstance();
  });

  it("throws for unimplemented OCPP types", () => {
    assert.throws(
      () => ChargerProviderFactory.create("ocpp16"),
      /not implemented yet/,
    );
  });
});
