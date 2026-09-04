import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCompanySchema, registerSchema, walletTopUpSchema } from "./index";

describe("createCompanySchema", () => {
  it("validates a valid company", () => {
    const result = createCompanySchema.safeParse({
      name: "EV Charge Co",
      slug: "ev-charge-co",
    });
    assert.equal(result.success, true);
  });

  it("rejects invalid slug", () => {
    const result = createCompanySchema.safeParse({
      name: "EV Charge Co",
      slug: "Invalid Slug!",
    });
    assert.equal(result.success, false);
  });
});

describe("registerSchema", () => {
  it("defaults role to DRIVER", () => {
    const result = registerSchema.safeParse({
      email: "driver@example.com",
      password: "TestPass123",
      fullName: "Test Driver",
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.role, "DRIVER");
  });

  it("rejects ADMIN self-registration", () => {
    const result = registerSchema.safeParse({
      email: "admin@example.com",
      password: "TestPass123",
      fullName: "Admin User",
      role: "ADMIN",
    });
    assert.equal(result.success, false);
  });
});

describe("walletTopUpSchema", () => {
  it("accepts preset amounts in cents", () => {
    const result = walletTopUpSchema.safeParse({ amountCents: 2000 });
    assert.equal(result.success, true);
  });

  it("rejects negative or tiny amounts", () => {
    assert.equal(walletTopUpSchema.safeParse({ amountCents: -1 }).success, false);
    assert.equal(walletTopUpSchema.safeParse({ amountCents: 50 }).success, false);
  });
});
