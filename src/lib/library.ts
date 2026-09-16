/** Physical layout of this Library — shared by the API, the pages and the 3D scenes. */
export const LIBRARY = {
  walls: 5,
  shelves: 7,
  volumes: 31,
  pages: 421,
  pageLength: 4819,
  titleLength: 31,
} as const;

/**
 * Digits of an address: every symbol of a page is written as one of them. There are more digits
 * than symbols in either alphabet, so both Libraries share one address format.
 */
export const DIGS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function isValidHex(hex: unknown): hex is string {
  return typeof hex === "string" && hex.length > 0 && hex.length <= LIBRARY.pageLength && /^[0-9a-zA-Z]+$/.test(hex);
}
