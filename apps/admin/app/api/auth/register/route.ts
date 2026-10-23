import { NextRequest, NextResponse } from "next/server";
import { postLoginPath } from "@evcharge/shared";
import { apiBaseUrl, applyAuthCookies } from "@/lib/auth-cookies";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${apiBaseUrl()}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, role: "DRIVER" }),
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

  if (!data.user || !data.accessToken || !data.refreshToken) {
    return NextResponse.json({ message: "Não foi possível criar a conta." }, { status: 401 });
  }

  const redirectTo = postLoginPath(data.user.role);
  if (redirectTo !== "/app") {
    return NextResponse.json({ message: "Esta conta não tem acesso ao app." }, { status: 403 });
  }

  const response = NextResponse.json({ user: data.user, redirectTo });
  applyAuthCookies(response, {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
  return response;
}
