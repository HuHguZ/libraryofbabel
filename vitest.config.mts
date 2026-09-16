import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    // next-intl imports "next/navigation" without an extension, which Node's ESM loader cannot resolve; Vite can.
    server: { deps: { inline: ["next-intl"] } },
  },
});
