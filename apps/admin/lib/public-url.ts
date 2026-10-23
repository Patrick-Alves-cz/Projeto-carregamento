import type { NextRequest } from "next/server";

/** Public site origin (works behind Cloudflare / reverse proxies). */
export function publicOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (request.nextUrl.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}

export function publicUrl(request: NextRequest, path: string): URL {
  return new URL(path, publicOrigin(request));
}

export function isHttpsRequest(request: NextRequest): boolean {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    request.nextUrl.protocol.replace(":", "");
  return proto === "https";
}
