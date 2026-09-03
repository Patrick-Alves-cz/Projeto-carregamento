import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, applyAuthCookies, clearAuthCookies } from "@/lib/auth-cookies";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("evcharge_refresh")?.value;
  if (!refreshToken) {
    const response = NextResponse.json({ message: "Sessão expirada" }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
  };

  if (!res.ok || !data.accessToken || !data.refreshToken) {
    const response = NextResponse.json({ message: "Sessão expirada" }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const response = NextResponse.json({ ok: true });
  applyAuthCookies(response, {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
  return response;
}
