import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotFoundError } from "./index";

describe("NotFoundError", () => {
  it("creates error with correct code", () => {
    const error = new NotFoundError("Station", "abc123");
    assert.equal(error.code, "NOT_FOUND");
    assert.match(error.message, /Station/);
  });
});
