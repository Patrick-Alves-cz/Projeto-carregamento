import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Loaded via `node --import` before any test module (and therefore before
// AppModule) is imported. This guarantees JWT/DB env vars are present when
// JwtModule.register() and other module-level config are evaluated at import
// time; otherwise ES module import hoisting evaluates them before dotenv runs.
const here = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(here, "../../../.env") });
config({ path: resolve(here, "../../../packages/database/.env"), override: true });
