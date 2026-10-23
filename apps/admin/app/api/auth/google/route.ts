import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isHttpsRequest, publicOrigin, publicUrl } from "@/lib/public-url";

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

function redirectUri(request: NextRequest) {
  if (process.env.GOOGLE_REDIRECT_URI?.trim()) return process.env.GOOGLE_REDIRECT_URI.trim();
  return `${publicOrigin(request)}/api/auth/google/callback`;
}

export async function GET(request: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(publicUrl(request, "/login?oauth=google_missing"));
  }

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    state,
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
  response.cookies.set("evcharge_google_oauth", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request) || process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
