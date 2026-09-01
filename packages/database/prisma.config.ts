import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

// Load root .env first, then allow package-local overrides.
config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, ".env"), override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
