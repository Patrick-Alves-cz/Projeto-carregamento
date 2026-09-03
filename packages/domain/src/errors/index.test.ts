import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InvalidStateTransitionError, NotFoundError } from "./index";

describe("NotFoundError", () => {
  it("creates error with correct code", () => {
    const error = new NotFoundError("Station", "abc123");
    assert.equal(error.code, "NOT_FOUND");
    assert.match(error.message, /Station/);
  });
});

describe("InvalidStateTransitionError", () => {
  it("creates error with transition details", () => {
    const error = new InvalidStateTransitionError("session", "COMPLETED", "ACTIVE");
    assert.equal(error.code, "INVALID_STATE_TRANSITION");
    assert.match(error.message, /COMPLETED/);
  });
});
