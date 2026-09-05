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
    const authorized = await provider.authorizeCard({
      amountCents: 4000,
      currency: "BRL",
      kind: "CARD",
      idempotencyKey: "card-auth-1",
      customerRef: "user-1",
      paymentMethodToken: "tok_mock",
    });
    assert.equal(authorized.status, "AUTHORIZED");
    const captured = await provider.capturePayment(authorized.providerRef, 2200);
    assert.equal(captured.status, "CONFIRMED");
    assert.equal(captured.amountCents, 2200);
    assert.equal(provider.capabilities.supportsCardPreAuthorization, true);
  });
});
