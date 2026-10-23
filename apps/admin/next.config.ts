import type { NextConfig } from "next";
import path from "path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.join(__dirname, "../.."));

const driverOrigin = process.env.DRIVER_ORIGIN ?? "http://127.0.0.1:8082";

const nextConfig: NextConfig = {
  transpilePackages: ["@evcharge/shared", "@evcharge/ui", "maplibre-gl"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  ...(process.env.ADMIN_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  async rewrites() {
    return [
      { source: "/admin", destination: "/dashboard" },
      { source: "/admin/:path*", destination: "/dashboard/:path*" },
      { source: "/app", destination: `${driverOrigin}/app` },
      { source: "/app/:path*", destination: `${driverOrigin}/app/:path*` },
      { source: "/_expo/:path*", destination: `${driverOrigin}/_expo/:path*` },
      { source: "/node_modules/:path*", destination: `${driverOrigin}/node_modules/:path*` },
      { source: "/assets/:path*", destination: `${driverOrigin}/assets/:path*` },
    ];
  },
};

export default nextConfig;
