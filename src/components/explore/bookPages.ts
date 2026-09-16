"use client";

import * as THREE from "three";
import { LIBRARY } from "@/lib/library";
import { findMatches } from "@/lib/alphabet";
import { canvasTexture, createCanvas, drawSpacedText, wrapLines } from "./textTexture";

/** Size of one page on the reading table, metres. */
export const PAGE = { w: 1.42, d: 2.0 } as const;

/** Canvas of the title page and the index of pages. */
export const INDEX_CANVAS = { w: 1024, h: 1448 } as const;
/** Canvas of a page of text: 80 letters to the line, 61 lines. */
export const TEXT_CANVAS = { w: 1200, h: 1700 } as const;

export const TEXT_LAYOUT = {
  cols: 80,
  left: 110,
  right: 1090,
  top: 190,
  lineHeight: 23.4,
  fontSize: 24,
} as const;

export const INK = "#3a2a18";
export const INK_SOFT = "rgba(58, 42, 24, 0.55)";
export const HIGHLIGHT = "rgba(201, 150, 40, 0.55)";

export function drawParchment(ctx: CanvasRenderingContext2D, parchment: THREE.Texture, w: number, h: number) {
  ctx.fillStyle = "#e6d6b4";
  ctx.fillRect(0, 0, w, h);
  const image = parchment.image as CanvasImageSource | undefined;
  if (image) {
    try {
      ctx.drawImage(image, 0, 0, w, h);
    } catch {
      /* flat fill stays */
    }
  }
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.8);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(70, 45, 15, 0.3)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawRule(ctx: CanvasRenderingContext2D, cx: number, y: number, width = 520) {
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, y);
  ctx.lineTo(cx + width / 2, y);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx, y - 7);
  ctx.lineTo(cx + 7, y);
  ctx.lineTo(cx, y + 7);
  ctx.lineTo(cx - 7, y);
  ctx.closePath();
  ctx.fill();
}

/** Words printed on the title page, in the reader's language. */
export interface TitlePageText {
  title: string;
  /** Running line above the title, e.g. "THE LIBRARY OF BABEL". */
  library: string;
  /** Shown when the volume's title is blank. */
  untitled: string;
  /** "Volume 3". */
  volume: string;
  /** "Wall 1 · Shelf 2". */
  location: string;
  epigraph: string;
  epigraphSource: string;
}

/** The title page of a volume (left page of the first spread). */
export function makeTitlePage(family: string, parchment: THREE.Texture, info: TitlePageText): THREE.CanvasTexture {
  const W = INDEX_CANVAS.w;
  const H = INDEX_CANVAS.h;
  const [canvas, ctx] = createCanvas(W, H);
  drawParchment(ctx, parchment, W, H);
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.font = `500 26px ${family}`;
  drawSpacedText(ctx, info.library, W / 2, 150, 9);
  drawRule(ctx, W / 2, 200);

  const title = info.title.trim() || info.untitled;
  let size = 64;
  ctx.font = `500 ${size}px ${family}`;
  let lines = wrapLines(ctx, title, 820);
  while (lines.length > 3 && size > 36) {
    size -= 4;
    ctx.font = `500 ${size}px ${family}`;
    lines = wrapLines(ctx, title, 820);
  }
  const startY = 470 - ((lines.length - 1) * size * 1.2) / 2;
  ctx.textAlign = "center";
  lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * size * 1.2));

  drawRule(ctx, W / 2, 700, 380);
  ctx.font = `500 46px ${family}`;
  ctx.textAlign = "center";
  ctx.fillText(info.volume, W / 2, 790);
  ctx.font = `400 30px ${family}`;
  ctx.fillStyle = INK_SOFT;
  drawSpacedText(ctx, info.location, W / 2, 850, 2);

  ctx.fillStyle = INK;
  ctx.font = `italic 400 30px ${family}`;
  const epigraph = wrapLines(ctx, info.epigraph, 680);
  ctx.textAlign = "left";
  epigraph.forEach((line, i) => {
    const w = ctx.measureText(line).width;
    ctx.fillText(line, (W - w) / 2, 1100 + i * 40);
  });
  ctx.font = `400 24px ${family}`;
  ctx.fillStyle = INK_SOFT;
  drawSpacedText(ctx, info.epigraphSource, W / 2, 1120 + epigraph.length * 40, 2);
  return canvasTexture(canvas);
}

/* ── The index of pages (right page of the open volume) ── */
export const INDEX = (() => {
  const cols = 21;
  const rows = Math.ceil(LIBRARY.pages / cols);
  const grid = { x0: 64, y0: 262, x1: 960, y1: 1392 };
  return { cols, rows, grid, cellW: (grid.x1 - grid.x0) / cols, cellH: (grid.y1 - grid.y0) / rows };
})();

/** The heading of the index ("Index of pages") and the line under it. */
export function makeIndexPage(family: string, parchment: THREE.Texture, text: { title: string; subtitle: string }): THREE.CanvasTexture {
  const W = INDEX_CANVAS.w;
  const H = INDEX_CANVAS.h;
  const [canvas, ctx] = createCanvas(W, H);
  drawParchment(ctx, parchment, W, H);
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.font = `500 44px ${family}`;
  drawSpacedText(ctx, text.title, W / 2, 130, 3);
  ctx.font = `400 24px ${family}`;
  ctx.fillStyle = INK_SOFT;
  drawSpacedText(ctx, text.subtitle, W / 2, 180, 1);
  drawRule(ctx, W / 2, 222);

  const { cols, rows, grid, cellW, cellH } = INDEX;
  ctx.strokeStyle = "rgba(58, 42, 24, 0.14)";
  ctx.lineWidth = 1;
  for (let r = 0; r <= rows; r++) {
    const y = grid.y0 + r * cellH;
    const cellsInRow = r < rows ? Math.min(cols, LIBRARY.pages - r * cols) : Math.min(cols, LIBRARY.pages - (r - 1) * cols);
    ctx.beginPath();
    ctx.moveTo(grid.x0, y);
    ctx.lineTo(grid.x0 + cellsInRow * cellW, y);
    ctx.stroke();
  }
  ctx.font = `500 25px ${family}`;
  ctx.textAlign = "center";
  for (let i = 0; i < LIBRARY.pages; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = grid.x0 + col * cellW + cellW / 2;
    const cy = grid.y0 + row * cellH + cellH / 2;
    ctx.fillStyle = i % 2 ? INK : "rgba(58, 42, 24, 0.85)";
    ctx.fillText(String(i + 1), cx, cy + 1);
  }
  return canvasTexture(canvas);
}

/** Index of the page under a UV of the index page, or null outside the grid. */
export function indexCellFromUv(uv: THREE.Vector2): number | null {
  const { cols, rows, grid, cellW, cellH } = INDEX;
  const cx = uv.x * INDEX_CANVAS.w;
  const cy = (1 - uv.y) * INDEX_CANVAS.h;
  const col = Math.floor((cx - grid.x0) / cellW);
  const row = Math.floor((cy - grid.y0) / cellH);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  const index = row * cols + col;
  return index < LIBRARY.pages ? index : null;
}

/** Centre of a cell of the index page, as fractions of the page (0..1 across, 0..1 down). */
export function indexCellCenter(index: number): { x: number; y: number } {
  const { cols, grid, cellW, cellH } = INDEX;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: (grid.x0 + col * cellW + cellW / 2) / INDEX_CANVAS.w, y: (grid.y0 + row * cellH + cellH / 2) / INDEX_CANVAS.h };
}

/* ── A page of text ── */
export interface TextPageInfo {
  content: string;
  page: number;
  title: string;
  /** Running head when the volume's title is blank. */
  untitled: string;
  /** Left pages carry the page number in the left corner, right pages in the right one. */
  side: "left" | "right";
  /** Phrase to highlight (already in the Library's alphabet). */
  query?: string;
}

export interface TextPageResult {
  texture: THREE.CanvasTexture;
  /** Start offsets of the highlighted phrase. */
  matches: number[];
  /** Position of the first highlight as fractions of the page (0..1 across, 0..1 down), if any. */
  firstMatch: { x: number; y: number } | null;
}

/** Lines of a page: 80 letters each. */
export function pageLines(content: string): string[] {
  const lines: string[] = [];
  for (let i = 0; i < content.length; i += TEXT_LAYOUT.cols) lines.push(content.slice(i, i + TEXT_LAYOUT.cols));
  return lines;
}

function fitTitle(ctx: CanvasRenderingContext2D, title: string, maxWidth: number): string {
  if (ctx.measureText(title).width <= maxWidth) return title;
  let t = title;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function makeTextPage(family: string, parchment: THREE.Texture, info: TextPageInfo): TextPageResult {
  const W = TEXT_CANVAS.w;
  const H = TEXT_CANVAS.h;
  const { left, right, top, lineHeight, fontSize, cols } = TEXT_LAYOUT;
  const [canvas, ctx] = createCanvas(W, H);
  drawParchment(ctx, parchment, W, H);

  // Running head: the title of the volume and the page number in the outer corner.
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK_SOFT;
  ctx.font = `italic 400 22px ${family}`;
  ctx.textAlign = "center";
  const head = fitTitle(ctx, info.title.trim() || info.untitled, 620);
  ctx.fillText(head, W / 2, 104);
  ctx.font = `500 24px ${family}`;
  ctx.textAlign = info.side === "left" ? "left" : "right";
  ctx.fillText(String(info.page), info.side === "left" ? left : right, 104);
  ctx.strokeStyle = "rgba(58, 42, 24, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, 132);
  ctx.lineTo(right, 132);
  ctx.stroke();

  const lines = pageLines(info.content);
  const query = info.query ?? "";
  const matches = findMatches(info.content, query);
  ctx.font = `500 ${fontSize}px ${family}`;
  ctx.textAlign = "left";
  const avail = right - left;

  // Width scale per line: long lines are condensed to the text block, as fillText(maxWidth) does.
  const scales = lines.map((line) => Math.min(1, avail / Math.max(1, ctx.measureText(line).width)));
  let firstMatch: TextPageResult["firstMatch"] = null;

  if (matches.length) {
    ctx.fillStyle = HIGHLIGHT;
    for (const start of matches) {
      const end = start + query.length;
      for (let l = Math.floor(start / cols); l * cols < end && l < lines.length; l++) {
        const line = lines[l];
        const s = Math.max(start, l * cols) - l * cols;
        const e = Math.min(end, (l + 1) * cols) - l * cols;
        const x0 = left + ctx.measureText(line.slice(0, s)).width * scales[l];
        const x1 = left + ctx.measureText(line.slice(0, e)).width * scales[l];
        const y = top + l * lineHeight;
        ctx.fillRect(x0 - 2, y - fontSize * 0.72, Math.max(6, x1 - x0 + 4), fontSize * 1.02);
        if (!firstMatch) firstMatch = { x: (x0 + x1) / 2 / W, y: y / H };
      }
    }
  }

  ctx.fillStyle = INK;
  lines.forEach((line, l) => ctx.fillText(line, left, top + l * lineHeight, avail));

  // Folio.
  ctx.fillStyle = INK_SOFT;
  ctx.font = `400 22px ${family}`;
  ctx.textAlign = "center";
  ctx.fillText(`— ${info.page} —`, W / 2, H - 58);

  return { texture: canvasTexture(canvas), matches, firstMatch };
}

/** A blank page of the same paper (while its text is still on its way). */
export function makeBlankPage(parchment: THREE.Texture): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 362);
  drawParchment(ctx, parchment, 256, 362);
  return canvasTexture(canvas);
}
