import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authorizationAmountCents, mapProviderPaymentStatus, toPrismaPaymentStatus } from "./payment-status";

describe("payment status mapping", () => {
  it("maps gateway statuses to internal states", () => {
    assert.equal(mapProviderPaymentStatus("RECEIVED"), "PAID");
    assert.equal(mapProviderPaymentStatus("CONFIRMED"), "PAID");
    assert.equal(mapProviderPaymentStatus("OVERDUE"), "EXPIRED");
    assert.equal(mapProviderPaymentStatus("REFUND_REQUESTED"), "REFUND_PENDING");
    assert.equal(toPrismaPaymentStatus("PAID"), "CONFIRMED");
  });

  it("uses documented auth floor instead of a hidden global", () => {
    assert.equal(
      authorizationAmountCents({
        estimatedTotalCents: 2200,
        minBalanceCents: 1000,
        energyKwh: 30,
        durationMinutes: 60,
      }),
      2200,
    );
    assert.equal(
      authorizationAmountCents({
        estimatedTotalCents: 400,
        minBalanceCents: 1000,
        energyKwh: 5,
        durationMinutes: 10,
      }),
      1000,
    );
  });
});
