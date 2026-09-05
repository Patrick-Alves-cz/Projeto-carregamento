import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockPaymentProvider } from "./mock/mock-payment-provider";

describe("MockPaymentProvider", () => {
  it("creates idempotent PIX charges without storing card data", async () => {
    const provider = new MockPaymentProvider();
    const first = await provider.createPayment({
      amountCents: 2500,
      currency: "BRL",
      kind: "PIX",
      idempotencyKey: "pix-1",
      customerRef: "user-1",
    });
    const second = await provider.createPayment({
      amountCents: 2500,
      currency: "BRL",
      kind: "PIX",
      idempotencyKey: "pix-1",
      customerRef: "user-1",
    });
    assert.equal(first.providerRef, second.providerRef);
    assert.equal(first.status, "PENDING");
    assert.ok(first.pixCopyPaste);
    const confirmed = provider.simulate(first.providerRef, "CONFIRMED");
    assert.equal(confirmed.status, "CONFIRMED");
  });
});
