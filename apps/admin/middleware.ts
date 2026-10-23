import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isAdminPanelRole, isDriverRole, postLoginPath } from "@evcharge/shared";

function publicUrl(request: NextRequest, path: string) {
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto = forwardedProto ?? (request.nextUrl.protocol === "https:" ? "https" : "http");
    return new URL(path, `${proto}://${forwardedHost}`);
  }
  return new URL(path, request.url);
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(publicUrl(request, path));
}

async function readAccessPayload(token: string | undefined) {
  if (!token) return null;
  const secret = process.env.JWT_ACCESS_SECRET?.trim();
  if (!secret) return null;
  try {
    const raw = decodeURIComponent(token);
    const { payload } = await jwtVerify(raw, new TextEncoder().encode(secret), {
      clockTolerance: 60,
    });
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/node_modules") ||
    pathname.startsWith("/_expo") ||
    pathname.startsWith("/assets") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const access = request.cookies.get("evcharge_access")?.value;
  const refresh = request.cookies.get("evcharge_refresh")?.value;
  const payload = await readAccessPayload(access);
  const role = typeof payload?.role === "string" ? payload.role : null;
  const hasSession = Boolean(payload || refresh);
  const destination = postLoginPath(role);

  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  const isPublic =
    isLogin ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/acesso-negado") ||
    pathname.startsWith("/termos") ||
    pathname.startsWith("/privacidade");
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAppArea = pathname === "/app" || pathname.startsWith("/app/");

  if (pathname === "/") {
    if (payload) return redirectTo(request, destination);
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    return NextResponse.rewrite(login);
  }

  if (isAppArea) {
    if (
      pathname.startsWith("/app/_expo") ||
      pathname.startsWith("/app/assets") ||
      pathname.startsWith("/app/node_modules")
    ) {
      return NextResponse.next();
    }
    if (payload && isAdminPanelRole(role ?? "")) {
      return redirectTo(request, "/admin");
    }
    const appPublic =
      pathname === "/app/register" ||
      pathname.startsWith("/app/register/") ||
      pathname.startsWith("/app/forgot-password") ||
      pathname.startsWith("/app/reset-password");
    if (!hasSession && !appPublic) {
      return redirectTo(request, "/login");
    }
    return NextResponse.next();
  }

  if (isAdminArea) {
    if (!hasSession) return redirectTo(request, "/login");
    if (payload && isDriverRole(role ?? "")) {
      return redirectTo(request, "/acesso-negado");
    }
    if (payload && !isAdminPanelRole(role ?? "")) {
      return redirectTo(request, "/acesso-negado");
    }
    return NextResponse.next();
  }

  if (!hasSession && !isPublic) {
    return redirectTo(request, "/login");
  }

  if (hasSession && isLogin && payload) {
    return redirectTo(request, destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
