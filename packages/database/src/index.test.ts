import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("@evcharge/database", () => {
  it("exports prisma client module", async () => {
    const mod = await import("./index");
    assert.ok(typeof mod.prisma === "object");
  });
});
