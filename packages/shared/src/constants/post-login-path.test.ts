import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postLoginPath } from "./index";

describe("postLoginPath", () => {
  it("sends DRIVER to /app", () => {
    assert.equal(postLoginPath("DRIVER"), "/app");
  });

  it("sends operator, admin and super admin to /admin", () => {
    assert.equal(postLoginPath("OPERATOR"), "/admin");
    assert.equal(postLoginPath("ADMIN"), "/admin");
    assert.equal(postLoginPath("SUPER_ADMIN"), "/admin");
  });

  it("rejects unknown roles", () => {
    assert.equal(postLoginPath("VIEWER"), "/acesso-negado");
    assert.equal(postLoginPath(null), "/acesso-negado");
  });
});
