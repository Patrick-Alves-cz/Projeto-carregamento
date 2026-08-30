import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCompanySchema } from "./index";

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
