"use client";

import * as THREE from "three";
import { LIBRARY } from "@/lib/library";
import { findMatches } from "@/lib/alphabet";
import { DEFAULT_FRAGMENT_COLOR, FRAGMENT_ALPHA, fragmentWash } from "@/lib/fragmentColor";
import { canvasTexture, createCanvas, drawSpacedText, wrapLines } from "./textTexture";

/** Size of one page on the reading table, metres. */
export const PAGE = { w: 1.42, d: 2.0 } as const;

/** Canvas of the title page and the index of pages. */
export const INDEX_CANVAS = { w: 1024, h: 1448 } as const;
/** Canvas of a page of text: 80 letters to the line, 61 lines. */
export const TEXT_CANVAS = { w: 1200, h: 1700 } as const;

export const TEXT_LAYOUT = {
  cols: 80,
  rows: 61,
  left: 110,
  right: 1090,
  top: 190,
  lineHeight: 23.4,
  fontSize: 24,
  /** Longest lines the type may shrink to when line breaks leave too many lines for the page. */
  maxCols: 200,
} as const;

export const INK = "#3a2a18";
export const INK_SOFT = "rgba(58, 42, 24, 0.55)";
export const HIGHLIGHT = "rgba(201, 150, 40, 0.55)";
/** The occurrence of the phrase the reader is at, among the others. */
export const HIGHLIGHT_CURRENT = "rgba(232, 118, 22, 0.8)";

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
  /** Fragment to mark: character offsets into `content`, the end exclusive. */
  mark?: { start: number; end: number } | null;
  /** The reader's fragment colour, "#rrggbb". */
  markColor?: string;
  /** Start of the occurrence of the phrase the reader is at, if it is on this page. */
  current?: number | null;
}

export interface TextPageResult {
  texture: THREE.CanvasTexture;
  /** Start offsets of the highlighted phrase. */
  matches: number[];
  /** Position of the first highlight as fractions of the page (0..1 across, 0..1 down), if any. */
  firstMatch: { x: number; y: number } | null;
  /** Centre of the marked fragment as fractions of the page, if there is one. */
  markCenter: { x: number; y: number } | null;
  /** Position of the current occurrence as fractions of the page, if it is on this page. */
  currentMatch: { x: number; y: number } | null;
}

/** A line of a page: offsets into the text, the end exclusive; `brk` when a line break (not drawn) follows it. */
export interface PageLine {
  start: number;
  end: number;
  brk: boolean;
}

/** Lines of a page: broken at every line break and wrapped at `cols` letters. */
export function pageLines(content: string, cols: number = TEXT_LAYOUT.cols): PageLine[] {
  const lines: PageLine[] = [];
  let start = 0;
  for (;;) {
    const nl = content.indexOf("\n", start);
    const stop = nl === -1 ? content.length : nl;
    let s = start;
    do {
      const end = Math.min(stop, s + cols);
      lines.push({ start: s, end, brk: end === stop && nl !== -1 });
      s = end;
    } while (s < stop);
    if (nl === -1) return lines;
    start = nl + 1;
  }
}

/**
 * How a page is set: 80 letters to the line and 61 lines, unless line breaks leave more lines than that.
 * Then the type gets smaller and the lines longer, just enough for every line to fit the same text block.
 */
export function layoutPage(content: string) {
  const { cols, rows, maxCols, fontSize, lineHeight } = TEXT_LAYOUT;
  const runs = content.split("\n").map((run) => run.length);
  const count = (c: number) => runs.reduce((n, len) => n + Math.max(1, Math.ceil(len / c)), 0);
  let c = cols;
  while (c < maxCols && count(c) > Math.floor((rows * c) / cols)) c++;
  const scale = cols / c;
  const lines = pageLines(content, c);
  // Past the smallest type a page cannot hold all its lines (only a text of nearly nothing but line breaks).
  return { lines: lines.slice(0, Math.floor(rows / scale)), scale, fontSize: fontSize * scale, lineHeight: lineHeight * scale };
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
  const { left, right, top } = TEXT_LAYOUT;
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

  const { lines, fontSize, lineHeight } = layoutPage(info.content);
  const texts = lines.map((line) => info.content.slice(line.start, line.end));
  const query = info.query ?? "";
  const matches = findMatches(info.content, query);
  ctx.font = `500 ${fontSize}px ${family}`;
  ctx.textAlign = "left";
  const avail = right - left;

  // Width scale per line: long lines are condensed to the text block, as fillText(maxWidth) does.
  const scales = texts.map((text) => Math.min(1, avail / Math.max(1, ctx.measureText(text).width)));
  let firstMatch: TextPageResult["firstMatch"] = null;
  let markCenter: TextPageResult["markCenter"] = null;
  let currentMatch: TextPageResult["currentMatch"] = null;

  /** Spans covering the characters from `start` to `end` (exclusive), one per line they run over. A line break shows at the end of its line. */
  const spans = (start: number, end: number) => {
    const out: { x0: number; x1: number; y: number }[] = [];
    lines.forEach((line, l) => {
      if (line.start >= end || line.end + (line.brk ? 1 : 0) <= start) return;
      const s = Math.max(start, line.start) - line.start;
      const e = Math.min(end, line.end) - line.start;
      const x = (n: number) => left + ctx.measureText(texts[l].slice(0, n)).width * scales[l];
      out.push({ x0: x(s), x1: x(Math.max(s, e)), y: top + l * lineHeight });
    });
    return out;
  };

  /**
   * Washes the spans in one fill. Each band is exactly a line tall and all of them go into a single path,
   * so where a highlight runs on to the next line the translucent colour is not laid twice (that showed
   * as a dark line under the text).
   */
  const wash = (color: string, list: { x0: number; x1: number; y: number }[], pad: number, minWidth: number) => {
    if (list.length === 0) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const { x0, x1, y } of list) ctx.rect(x0 - pad, y - fontSize * 0.72, Math.max(minWidth, x1 - x0 + 2 * pad), lineHeight);
    ctx.fill();
  };

  // The marked fragment lies under the search highlights.
  const markStart = Math.max(0, info.mark?.start ?? 0);
  const markEnd = Math.min(info.content.length, info.mark?.end ?? 0);
  const marked = markEnd > markStart ? spans(markStart, markEnd) : [];
  if (marked.length) {
    wash(fragmentWash(info.markColor ?? DEFAULT_FRAGMENT_COLOR, FRAGMENT_ALPHA.book), marked, 1, 4);
    const x0 = Math.min(...marked.map((s) => s.x0));
    const x1 = Math.max(...marked.map((s) => s.x1));
    markCenter = { x: (x0 + x1) / 2 / W, y: (marked[0].y + marked[marked.length - 1].y) / 2 / H };
  }

  if (matches.length) {
    const others: { x0: number; x1: number; y: number }[] = [];
    const current: { x0: number; x1: number; y: number }[] = [];
    for (const start of matches) {
      const isCurrent = start === info.current;
      for (const span of spans(start, start + query.length)) {
        (isCurrent ? current : others).push(span);
        const spot = { x: (span.x0 + span.x1) / 2 / W, y: span.y / H };
        if (!firstMatch) firstMatch = spot;
        if (isCurrent && !currentMatch) currentMatch = spot;
      }
    }
    wash(HIGHLIGHT, others, 2, 6);
    wash(HIGHLIGHT_CURRENT, current, 2, 6);
  }

  ctx.fillStyle = INK;
  texts.forEach((text, l) => ctx.fillText(text, left, top + l * lineHeight, avail));

  // Folio.
  ctx.fillStyle = INK_SOFT;
  ctx.font = `400 22px ${family}`;
  ctx.textAlign = "center";
  ctx.fillText(`— ${info.page} —`, W / 2, H - 58);

  return { texture: canvasTexture(canvas), matches, firstMatch, markCenter, currentMatch };
}

/** A blank page of the same paper (while its text is still on its way). */
export function makeBlankPage(parchment: THREE.Texture): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 362);
  drawParchment(ctx, parchment, 256, 362);
  return canvasTexture(canvas);
}
