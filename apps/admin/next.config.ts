import type { NextConfig } from "next";
import path from "path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.join(__dirname, "../.."));

const nextConfig: NextConfig = {
  transpilePackages: ["@evcharge/shared", "@evcharge/ui", "maplibre-gl"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  ...(process.env.ADMIN_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
