"use client";

import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: "#fdf6e3" },
          100: { value: "#f5e6c8" },
          200: { value: "#dcc48a" },
          300: { value: "#c9a84c" },
          400: { value: "#b8960f" },
          500: { value: "#9a7d0c" },
          600: { value: "#7c640a" },
          700: { value: "#5e4b07" },
          800: { value: "#403205" },
          900: { value: "#2a1f03" },
        },
        dark: {
          50: { value: "#c8c5d6" },
          100: { value: "#9e9bb5" },
          200: { value: "#7d7a96" },
          300: { value: "#6b6880" },
          400: { value: "#4a4760" },
          500: { value: "#1e1d2d" },
          600: { value: "#161623" },
          700: { value: "#111119" },
          800: { value: "#0c0c14" },
          900: { value: "#08080f" },
        },
        parchment: {
          50: { value: "#fffdf5" },
          100: { value: "#faf3e0" },
          200: { value: "#f0e4c9" },
          300: { value: "#e0cfad" },
          400: { value: "#d4c4a0" },
          500: { value: "#c0b08a" },
          900: { value: "#2a1f0e" },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
