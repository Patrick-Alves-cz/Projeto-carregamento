import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTariffEffective, pickEffectiveTariff, toTariffSnapshot } from "./tariff";

const base = {
  id: "t1",
  name: "Padrão",
  pricePerKwhCents: 189,
  pricePerMinuteCents: 0,
  idleFeeCents: 0,
  connectionFeeCents: 0,
  minBalanceCents: 1000,
  currency: "BRL",
  active: true,
  validFrom: null as Date | null,
  validTo: null as Date | null,
};

describe("tariff selection", () => {
  it("rejects inactive and out-of-window tariffs", () => {
    assert.equal(isTariffEffective({ ...base, active: false }), false);
    assert.equal(
      isTariffEffective({ ...base, validFrom: new Date("2099-01-01") }),
      false,
    );
  });

  it("prefers connector then station then company", () => {
    const picked = pickEffectiveTariff({
      connectorTariff: { ...base, id: "connector", name: "Conector" },
      stationTariff: { ...base, id: "station", name: "Estação" },
      companyTariffs: [{ ...base, id: "company", name: "Empresa" }],
    });
    assert.equal(picked?.id, "connector");
  });

  it("copies snapshot fields without live mutation risk", () => {
    const snapshot = toTariffSnapshot(base);
    assert.equal(snapshot.pricePerKwhCents, 189);
    assert.equal(snapshot.minBalanceCents, 1000);
  });
});
