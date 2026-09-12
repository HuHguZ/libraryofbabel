import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack ignores stray lockfiles above the project.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
