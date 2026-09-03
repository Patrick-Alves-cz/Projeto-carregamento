import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, clearAuthCookies } from "@/lib/auth-cookies";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("evcharge_refresh")?.value;
  if (refreshToken) {
    await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}
