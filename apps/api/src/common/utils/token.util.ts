import { createHash, randomBytes } from "crypto";
import { getRequiredJwtRefreshSecret } from "../config/jwt-secrets";

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  const pepper = getRequiredJwtRefreshSecret();
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  const multipliers: Record<"s" | "m" | "h" | "d", number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] ?? 60000);
}
