import { NextRequest, NextResponse } from "next/server";
import { postLoginPath } from "@evcharge/shared";
import { apiBaseUrl, applyAuthCookies } from "@/lib/auth-cookies";
import { isHttpsRequest, publicOrigin, publicUrl } from "@/lib/public-url";

function redirectUri(request: NextRequest) {
  if (process.env.GOOGLE_REDIRECT_URI?.trim()) return process.env.GOOGLE_REDIRECT_URI.trim();
  return `${publicOrigin(request)}/api/auth/google/callback`;
}

function fail(request: NextRequest, reason: string) {
  return NextResponse.redirect(
    publicUrl(request, `/login?oauth=error&reason=${encodeURIComponent(reason)}`),
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get("evcharge_google_oauth")?.value;
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) return fail(request, "missing_config");
  if (!code || !state || !expected || state !== expected) return fail(request, "invalid_state");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const tokenData = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenData.access_token) {
    return fail(request, tokenData.error || "token_exchange");
  }

  const authRes = await fetch(`${apiBaseUrl()}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: tokenData.access_token }),
  });
  const data = (await authRes.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    user?: { role: string };
    message?: string;
  };

  if (!authRes.ok || !data.user || !data.accessToken || !data.refreshToken) {
    return fail(request, data.message || "api_login");
  }

  const destination = postLoginPath(data.user.role);
  if (destination === "/acesso-negado") {
    return fail(request, "acesso_negado");
  }

  const response = NextResponse.redirect(publicUrl(request, destination));
  applyAuthCookies(
    response,
    {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    },
    { secure: isHttpsRequest(request) },
  );
  response.cookies.set("evcharge_google_oauth", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    secure: isHttpsRequest(request),
  });
  return response;
}
