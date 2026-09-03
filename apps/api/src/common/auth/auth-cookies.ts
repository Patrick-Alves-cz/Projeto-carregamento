import { Response } from "express";
import { parseDurationToMs } from "../utils/token.util";

const isProd = process.env.NODE_ENV === "production";

const baseCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
};

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie("evcharge_access", tokens.accessToken, {
    ...baseCookie,
    maxAge: parseDurationToMs(process.env.JWT_ACCESS_EXPIRES_IN ?? "15m"),
  });
  res.cookie("evcharge_refresh", tokens.refreshToken, {
    ...baseCookie,
    maxAge: parseDurationToMs(process.env.JWT_REFRESH_EXPIRES_IN ?? "7d"),
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie("evcharge_access", { path: "/" });
  res.clearCookie("evcharge_refresh", { path: "/" });
}
