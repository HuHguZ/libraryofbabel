import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The 3D scenes drive three.js imperatively from refs, event handlers and useFrame callbacks.
    // The React Compiler-era purity rules cannot see that those mutations never happen during render.
    files: ["src/components/explore/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "node_modules/**", "next-env.d.ts", "public/**"]),
]);
