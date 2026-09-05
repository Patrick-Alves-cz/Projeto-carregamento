import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../../../.env") });

const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
];

export function getAllowedCorsOrigins(): string[] {
  const extra = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...LOCAL_ORIGINS, ...extra])];
}
