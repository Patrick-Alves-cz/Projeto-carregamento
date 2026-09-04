import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isAdminPanelRole } from "@evcharge/shared";

async function readAccessPayload(token: string | undefined) {
  if (!token) return null;
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const access = request.cookies.get("evcharge_access")?.value;
  const refresh = request.cookies.get("evcharge_refresh")?.value;
  const payload = await readAccessPayload(access);
  const role = typeof payload?.role === "string" ? payload.role : null;
  const isLogin = request.nextUrl.pathname.startsWith("/login");
  const isPublic =
    isLogin ||
    request.nextUrl.pathname.startsWith("/invite") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password");
  const hasSession = Boolean(payload || refresh);

  if (payload && !isAdminPanelRole(role ?? "") && !isPublic) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set("evcharge_access", "", { path: "/", maxAge: 0 });
    response.cookies.set("evcharge_refresh", "", { path: "/", maxAge: 0 });
    return response;
  }

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSession && isLogin && (!payload || isAdminPanelRole(role ?? ""))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/invite/:path*", "/forgot-password", "/reset-password"],
};
