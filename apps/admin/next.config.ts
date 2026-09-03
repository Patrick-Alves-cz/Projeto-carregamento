import type { NextConfig } from "next";
import path from "path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.join(__dirname, "../.."));

const nextConfig: NextConfig = {
  transpilePackages: ["@evcharge/shared", "@evcharge/ui", "maplibre-gl"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
