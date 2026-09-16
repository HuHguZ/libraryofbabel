"use client";

import * as THREE from "three";

let fontPromise: Promise<string> | null = null;

/**
 * Resolves to the CSS font-family of the site's serif font (loaded by next/font),
 * once the browser can draw it on a canvas. Falls back to Georgia.
 */
export function loadSerifFont(): Promise<string> {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    if (typeof document === "undefined") return "Georgia, serif";
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--font-cormorant").trim();
    const family = raw ? `${raw}, Georgia, serif` : "Georgia, serif";
    const sample = "Вавилонская Библиотека Стена Полка Том The Library of Babel Wall Shelf Volume 0123456789 IVX «»—…";
    try {
      await Promise.all([400, 500, 600].map((w) => document.fonts.load(`${w} 40px ${family}`, sample)));
    } catch {
      /* the fallback family is always available */
    }
    return family;
  })();
  return fontPromise;
}

export function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  return [canvas, ctx];
}

export function canvasTexture(canvas: HTMLCanvasElement, anisotropy = 8): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Draws text with optional letter-spacing (spacing is applied by drawing glyph by glyph). */
export function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing = 0,
  align: "left" | "center" | "right" = "center"
) {
  if (!letterSpacing) {
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    return;
  }
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const previousAlign = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + letterSpacing;
  });
  ctx.textAlign = previousAlign;
}

/** Wraps a string into lines that fit `maxWidth` with the current ctx font. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Simple brass plaque with centered text — used for wall and shelf labels. */
export function makePlaqueTexture(
  text: string,
  family: string,
  opts: { width?: number; height?: number; fontSize?: number; letterSpacing?: number } = {}
): THREE.CanvasTexture {
  const width = opts.width ?? 512;
  const height = opts.height ?? 128;
  const [canvas, ctx] = createCanvas(width, height);
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#5a4620");
  grad.addColorStop(0.5, "#8a6f34");
  grad.addColorStop(1, "#4e3c1c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255, 226, 160, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, width - 16, height - 16);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, width - 28, height - 28);
  ctx.fillStyle = "#1a1208";
  ctx.font = `600 ${opts.fontSize ?? Math.round(height * 0.5)}px ${family}`;
  ctx.textBaseline = "middle";
  drawSpacedText(ctx, text, width / 2 + 1, height / 2 + 2, opts.letterSpacing ?? 4);
  ctx.fillStyle = "#f4dc9a";
  drawSpacedText(ctx, text, width / 2, height / 2, opts.letterSpacing ?? 4);
  return canvasTexture(canvas);
}
