import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@evcharge/shared", "@evcharge/ui"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
