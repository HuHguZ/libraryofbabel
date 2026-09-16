import { DIGS, MAX_ADDRESS_LENGTH } from "./library";

export function generateRandomHex(length: number = MAX_ADDRESS_LENGTH): string {
  let hex = "";
  for (let i = 0; i < length; i++) {
    hex += DIGS[Math.floor(Math.random() * DIGS.length)];
  }
  return hex;
}

/** Cheap 32-bit hash of a string (FNV-1a) — used to seed deterministic gallery variation. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 — tiny deterministic PRNG returning values in [0, 1). */
export function createRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short human-readable gallery label, e.g. "a3f9·c02e". */
export function shortHex(hex: string): string {
  if (!hex) return "…";
  return `${hex.slice(0, 4)}·${hex.slice(4, 8)}…`;
}

/**
 * Address of the gallery at (level, side) of the world that starts from `worldHex`
 * (the starting gallery itself is level 0, side "a"). Deterministic, so walking back
 * returns to the same books.
 */
export function cellHex(worldHex: string, level: number, side: "a" | "b"): string {
  if (level === 0 && side === "a") return worldHex;
  const rand = createRandom(hashString(`${worldHex}#${level}#${side}`));
  let hex = "";
  for (let i = 0; i < MAX_ADDRESS_LENGTH; i++) {
    hex += DIGS[Math.floor(rand() * DIGS.length)];
  }
  return hex;
}
