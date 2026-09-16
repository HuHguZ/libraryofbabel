import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack ignores stray lockfiles above the project.
  turbopack: {
    root: process.cwd(),
  },
};

export default createNextIntlPlugin()(nextConfig);
