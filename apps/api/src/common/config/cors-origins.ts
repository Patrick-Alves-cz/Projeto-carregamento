import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../../../.env") });

const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
];

const VERCEL_WEB_ORIGINS = [
  "https://evcharge-gamma.vercel.app",
  "https://evcharge-rufino-rent-car.vercel.app",
];

export function getAllowedCorsOrigins(): string[] {
  const extra = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...LOCAL_ORIGINS, ...VERCEL_WEB_ORIGINS, ...extra])];
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (getAllowedCorsOrigins().includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith(".trycloudflare.com") || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}
