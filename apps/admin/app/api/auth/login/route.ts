import { NextRequest, NextResponse } from "next/server";
import { isAdminPanelRole } from "@evcharge/shared";
import { apiBaseUrl, applyAuthCookies } from "@/lib/auth-cookies";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${apiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    user?: { role: string };
    message?: string;
  };

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  if (!data.user || !isAdminPanelRole(data.user.role) || !data.accessToken || !data.refreshToken) {
    return NextResponse.json(
      { message: "Esta conta não tem acesso ao painel administrativo." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ user: data.user });
  applyAuthCookies(response, {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
  return response;
}
