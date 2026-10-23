import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPasswordStrong, passwordRequirementChecks } from "./password-policy";

describe("password policy", () => {
  it("accepts letter + number with min length", () => {
    assert.equal(isPasswordStrong("Demo@12345"), true);
    assert.equal(isPasswordStrong("abc12345"), true);
  });

  it("rejects missing letter or number", () => {
    assert.equal(isPasswordStrong("abcdefgh"), false);
    assert.equal(isPasswordStrong("12345678"), false);
    assert.equal(isPasswordStrong("Ab1"), false);
  });

  it("exposes checklist flags", () => {
    const checks = passwordRequirementChecks("A1");
    assert.equal(checks.letter, true);
    assert.equal(checks.number, true);
    assert.equal(checks.length, false);
  });
});
