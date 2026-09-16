import { ALPHABETS } from "./alphabet";

/** Physical layout of this Library — shared by the API, the pages and the 3D scenes. */
export const LIBRARY = {
  walls: 5,
  shelves: 7,
  volumes: 31,
  pages: 421,
  pageLength: 4819,
  titleLength: 31,
} as const;

/** Digits of an address. Both Libraries share this one address format. */
export const DIGS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * How the symbols of a page are written as address digits: every `chars` symbols (of an alphabet of
 * `size`) as one number of `digits` digits (base `base`). An alphabet no bigger than the digits takes
 * one digit per symbol; a bigger one is packed into the densest blocks whose numbers stay exact in a double.
 */
export interface Packing {
  size: number;
  base: number;
  chars: number;
  digits: number;
}

const EXACT = 2 ** 53;

/** Fewest digits (base `base`) that can hold every run of `chars` symbols of an alphabet of `size`. */
export function digitsFor(size: number, chars: number, base: number): number {
  const count = size ** chars;
  let digits = 0;
  for (let span = 1; span < count; span *= base) digits++;
  return digits;
}

export function addressPacking(size: number, base = DIGS.length): Packing {
  let best = { chars: 1, digits: Math.max(1, digitsFor(size, 1, base)) };
  for (let chars = 2; size ** chars < EXACT; chars++) {
    const digits = digitsFor(size, chars, base);
    if (base ** digits >= EXACT) break;
    // A short last block is told apart by its width alone, so every run of 1..chars symbols needs its own width.
    let distinct = true;
    for (let run = 1; run < chars; run++) distinct &&= digitsFor(size, run, base) < digitsFor(size, run + 1, base);
    if (distinct && digits * best.chars < best.digits * chars) best = { chars, digits };
  }
  return { size, base, ...best };
}

/** Digits of an address that holds `length` symbols. */
export function addressLength(length: number, { size, base, chars, digits }: Packing): number {
  const tail = length % chars;
  return Math.floor(length / chars) * digits + (tail ? digitsFor(size, tail, base) : 0);
}

/** The longest address of a page in any Library: random addresses are this long, and no address may be longer. */
export const MAX_ADDRESS_LENGTH = Math.max(
  ...Object.values(ALPHABETS).map((alphabet) => addressLength(LIBRARY.pageLength, addressPacking(alphabet.length)))
);

export function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function isValidHex(hex: unknown): hex is string {
  return typeof hex === "string" && hex.length > 0 && hex.length <= MAX_ADDRESS_LENGTH && /^[0-9a-zA-Z]+$/.test(hex);
}
