import { cellKey, chunkOf, type Cell } from "@/lib/world";

/**
 * What the map shows: the point at the canvas centre — a gallery plus a fraction of one east (fx) and up (ff), both in
 * [0, 1) — and how many pixels a gallery takes along the row. A gallery occupies [x, x + 1) × [floor, floor + 1).
 */
export interface MapView {
  centre: Cell;
  fx: number;
  ff: number;
  scale: number;
}

/** A floor is drawn this much as tall as a gallery is wide (3.7 m against 9.7 m, a little taller to stay legible). */
export const FLOOR_RATIO = 0.55;
/** Pixels per gallery; wide views are watched in batches of at most 64 chunks. */
export const ZOOM = { min: 4, max: 48 } as const;
/** Galleries further than this from the centre of the view are off any screen. */
const FAR = 1_000_000n;

export const viewAround = (cell: Cell, scale: number, fx = 0.5, ff = 0.5): MapView => ({ centre: cell, fx, ff, scale });

/** Moves whole galleries out of the fractions into the centre. */
function normalise(view: MapView): MapView {
  const dx = Math.floor(view.fx);
  const df = Math.floor(view.ff);
  if (dx === 0 && df === 0) return view;
  return { ...view, centre: { x: view.centre.x + BigInt(dx), floor: view.centre.floor + BigInt(df) }, fx: view.fx - dx, ff: view.ff - df };
}

/** The pixel of a point of a gallery (fx, ff within it; its middle by default); Infinity when off any screen. */
export function pointOf(view: MapView, w: number, h: number, cell: Cell, fx = 0.5, ff = 0.5): [number, number] {
  const dx = cell.x - view.centre.x;
  const df = cell.floor - view.centre.floor;
  if (dx > FAR || dx < -FAR || df > FAR || df < -FAR) return [Infinity, Infinity];
  return [w / 2 + (Number(dx) + fx - view.fx) * view.scale, h / 2 - (Number(df) + ff - view.ff) * view.scale * FLOOR_RATIO];
}

/** The gallery under a pixel. */
export function cellAtPoint(view: MapView, w: number, h: number, px: number, py: number): Cell {
  const ux = view.fx + (px - w / 2) / view.scale;
  const uf = view.ff + (h / 2 - py) / (view.scale * FLOOR_RATIO);
  return { x: view.centre.x + BigInt(Math.floor(ux)), floor: view.centre.floor + BigInt(Math.floor(uf)) };
}

/** The view after dragging the map by (dx, dy) pixels. */
export const pan = (view: MapView, dx: number, dy: number): MapView =>
  normalise({ ...view, fx: view.fx - dx / view.scale, ff: view.ff + dy / (view.scale * FLOOR_RATIO) });

/** The view zoomed by `factor` (clamped to ZOOM) with the point under pixel (px, py) kept there. */
export function zoomAt(view: MapView, factor: number, px: number, py: number, w: number, h: number): MapView {
  const scale = Math.min(ZOOM.max, Math.max(ZOOM.min, view.scale * factor));
  const keep = 1 - view.scale / scale;
  const ux = (px - w / 2) / view.scale;
  const uf = (h / 2 - py) / (view.scale * FLOOR_RATIO);
  return normalise({ ...view, scale, fx: view.fx + ux * keep, ff: view.ff + uf * keep });
}

/** Keys of the chunks the canvas shows, nearest rows first. */
export function visibleChunks(view: MapView, w: number, h: number): string[] {
  const from = chunkOf(cellAtPoint(view, w, h, 0, h));
  const to = chunkOf(cellAtPoint(view, w, h, w, 0));
  const keys: string[] = [];
  for (let f = from.floor; f <= to.floor; f++) for (let x = from.x; x <= to.x; x++) keys.push(cellKey({ x, floor: f }));
  return keys;
}
