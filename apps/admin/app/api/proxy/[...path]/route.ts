import { NextRequest, NextResponse } from "next/server";
import { apiBaseUrl, applyAuthCookies, clearAuthCookies } from "@/lib/auth-cookies";

async function refreshTokens(refreshToken: string) {
  const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
  };
  if (!res.ok || !data.accessToken || !data.refreshToken) return null;
  return data as { accessToken: string; refreshToken: string };
}

async function proxy(request: NextRequest, path: string[]) {
  const search = request.nextUrl.search;
  const target = `${apiBaseUrl()}/${path.join("/")}${search}`;
  const refreshToken = request.cookies.get("evcharge_refresh")?.value;
  const accessToken = request.cookies.get("evcharge_access")?.value;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const idempotency = request.headers.get("idempotency-key");
  if (idempotency) headers.set("Idempotency-Key", idempotency);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const init: RequestInit = { method: request.method, headers };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.text();
  }

  let upstream = await fetch(target, init);
  let refreshed: { accessToken: string; refreshToken: string } | null = null;

  if (upstream.status === 401 && refreshToken) {
    refreshed = await refreshTokens(refreshToken);
    if (refreshed) {
      headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
      upstream = await fetch(target, { ...init, headers });
    }
  }

  const response = new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });

  if (refreshed) {
    applyAuthCookies(response, refreshed);
  } else if (upstream.status === 401) {
    clearAuthCookies(response);
  }

  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}
