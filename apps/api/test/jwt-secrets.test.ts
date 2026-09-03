import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { getRequiredJwtAccessSecret, getRequiredJwtRefreshSecret } from "../dist/common/config/jwt-secrets";

describe("JWT secrets", () => {
  it("reads configured access and refresh secrets", () => {
    assert.ok(getRequiredJwtAccessSecret().length >= 32);
    assert.ok(getRequiredJwtRefreshSecret().length >= 32);
  });

  it("fails closed when JWT_ACCESS_SECRET is missing outside test", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `
          process.env.NODE_ENV = "production";
          process.env.JWT_ACCESS_SECRET = "";
          const { getRequiredJwtAccessSecret } = require("./dist/common/config/jwt-secrets.js");
          try {
            getRequiredJwtAccessSecret();
            process.exit(2);
          } catch (error) {
            process.exit(String(error.message).includes("JWT_ACCESS_SECRET") ? 0 : 3);
          }
        `,
      ],
      { cwd: resolve(__dirname, ".."), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});
