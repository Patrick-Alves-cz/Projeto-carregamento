import { NextResponse } from "next/server";

const isProd = process.env.NODE_ENV === "production";

const base = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
};

export function applyAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
) {
  response.cookies.set("evcharge_access", tokens.accessToken, {
    ...base,
    maxAge: 15 * 60,
  });
  response.cookies.set("evcharge_refresh", tokens.refreshToken, {
    ...base,
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set("evcharge_access", "", { ...base, maxAge: 0 });
  response.cookies.set("evcharge_refresh", "", { ...base, maxAge: 0 });
}

export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
}
