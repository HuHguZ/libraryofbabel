"use client";

import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: "#fdf8ef" },
          100: { value: "#f5e6c8" },
          200: { value: "#e8d5b5" },
          300: { value: "#d4af37" },
          400: { value: "#c5a55a" },
          500: { value: "#b8960f" },
          600: { value: "#9a7d0c" },
          700: { value: "#7c640a" },
          800: { value: "#5e4b07" },
          900: { value: "#403205" },
        },
        dark: {
          50: { value: "#e8e8f0" },
          100: { value: "#c5c5d6" },
          200: { value: "#9e9eb8" },
          300: { value: "#6b6b8a" },
          400: { value: "#3d3d5c" },
          500: { value: "#1a1a2e" },
          600: { value: "#151528" },
          700: { value: "#111122" },
          800: { value: "#0d0d1a" },
          900: { value: "#0a0a1a" },
        },
        parchment: {
          50: { value: "#fffdf8" },
          100: { value: "#fef9f0" },
          200: { value: "#f5e6c8" },
          300: { value: "#e8d5b5" },
          400: { value: "#d4c4a0" },
          500: { value: "#c0b08a" },
          900: { value: "#2a1f0e" },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
