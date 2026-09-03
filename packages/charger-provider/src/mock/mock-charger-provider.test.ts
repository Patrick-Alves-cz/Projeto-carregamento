import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { MockChargerProvider } from "./mock-charger-provider";

describe("MockChargerProvider pause/resume", () => {
  let provider: MockChargerProvider;

  before(async () => {
    provider = new MockChargerProvider({ meterIntervalMs: 50 });
    await provider.registerCharger("chg-1", {
      maxPowerKw: 50,
      connectors: [{ number: 1, maxPowerKw: 50, status: "available" }],
      meterIntervalMs: 50,
    });
    await provider.connect("chg-1");
  });

  after(() => {
    provider.dispose();
  });

  it("pause stops metering and resume restarts it", async () => {
    await provider.startCharging("chg-1", 1, "session-1");
    await new Promise((r) => setTimeout(r, 120));
    const beforePause = await provider.getMeterValues("chg-1", 1);
    assert.ok(beforePause.energyKwh > 0);
    assert.ok(beforePause.powerKw > 0);

    await provider.pauseCharging("chg-1", 1);
    const paused = await provider.getMeterValues("chg-1", 1);
    assert.equal(paused.powerKw, 0);
    const pausedEnergy = paused.energyKwh;

    await new Promise((r) => setTimeout(r, 150));
    const stillPaused = await provider.getMeterValues("chg-1", 1);
    assert.equal(stillPaused.energyKwh, pausedEnergy);
    assert.equal(stillPaused.powerKw, 0);

    await provider.resumeCharging("chg-1", 1);
    await new Promise((r) => setTimeout(r, 120));
    const resumed = await provider.getMeterValues("chg-1", 1);
    assert.ok(resumed.energyKwh > pausedEnergy);
    assert.ok(resumed.powerKw > 0);

    await provider.stopCharging("chg-1", 1);
  });
});
