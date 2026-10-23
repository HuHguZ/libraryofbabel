import { DIGS, MAX_ADDRESS_LENGTH } from "./library";

/**
 * Where a gallery stands in the one Library: its column along its floor (galleries stand in rows, door to door) and
 * its floor. Whole numbers of any size: the Library is about 10^4318 galleries across.
 */
export interface Cell {
  x: bigint;
  floor: bigint;
}

export const CENTRE: Cell = { x: 0n, floor: 0n };

const BASE = BigInt(DIGS.length);
/** Eight digits at a time: 62^8 < 2^53, so a run of them is exact in a double. */
const RUN = 8;
const RUN_BASE = BASE ** BigInt(RUN);
const DIGIT = new Map(Array.from(DIGS, (d, i) => [d, i] as const));

/** How many galleries have an address shorter than `length` digits. */
const shorter = (length: bigint) => (BASE ** length - BASE) / (BASE - 1n);

/** How many galleries there are: one for every address of 1..MAX_ADDRESS_LENGTH digits. */
export const GALLERIES = shorter(BigInt(MAX_ADDRESS_LENGTH) + 1n);

/** n (≥ 0) in address digits, without leading zeros ("0" for zero). */
function toDigits(n: bigint): string {
  let out = "";
  do {
    let run = Number(n % RUN_BASE);
    n /= RUN_BASE;
    let part = "";
    for (let i = 0; i < RUN; i++) {
      part = DIGS[run % DIGS.length] + part;
      run = Math.floor(run / DIGS.length);
    }
    out = part + out;
  } while (n > 0n);
  return out.replace(/^0+(?=.)/, "");
}

/** Address digits as a number. */
function fromDigits(s: string): bigint {
  let n = 0n;
  for (let at = 0; at < s.length; ) {
    const width = at === 0 ? s.length % RUN || RUN : RUN;
    let run = 0;
    for (let i = at; i < at + width; i++) run = run * DIGS.length + (DIGIT.get(s[i]) ?? 0);
    n = n * (width === RUN ? RUN_BASE : BASE ** BigInt(width)) + BigInt(run);
    at += width;
  }
  return n;
}

/** Number of the gallery at an address: addresses ordered by length, then as numbers. */
export function addressIndex(hex: string): bigint {
  return shorter(BigInt(hex.length)) + fromDigits(hex);
}

/** Address of gallery number `index` (0 ≤ index < GALLERIES). */
export function addressAt(index: bigint): string {
  // shorter(length) ≤ index < shorter(length + 1)  ⇔  62^length ≤ 61·index + 62 < 62^(length + 1)
  const length = toDigits(index * (BASE - 1n) + BASE).length - 1;
  return toDigits(index - shorter(BigInt(length))).padStart(length, "0");
}

/** gcd(a, b) and the x with a·x ≡ gcd (mod b), 0 ≤ x < b. */
function gcdInverse(a: bigint, b: bigint): [bigint, bigint] {
  let [r0, r1, s0, s1] = [a, b, 1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return [r0, ((s0 % b) + b) % b];
}

/**
 * Addresses that share their first digits share the start of every page, so neighbouring galleries must not have
 * neighbouring numbers. A golden-ratio multiplier spreads them as far apart as any multiplier can; it is made coprime
 * with GALLERIES so that multiplying is a bijection, and UNMIX undoes it.
 */
const [MIX, UNMIX] = (() => {
  let mix = (GALLERIES * 618033988749894848n) / 10n ** 18n;
  for (;;) {
    const [gcd, inverse] = gcdInverse(mix, GALLERIES);
    if (gcd === 1n) return [mix, inverse];
    mix += 1n;
  }
})();
/** The centre of the Library is not its first address. */
const SHIFT = GALLERIES / 3n;

/** ⌊√n⌋ by Newton's method from above. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(16).length * 4 + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Whole numbers to naturals and back: 0, −1, 1, −2, 2 … ↔ 0, 1, 2, 3, 4 … */
const zig = (z: bigint) => (z >= 0n ? 2n * z : -2n * z - 1n);
const unzig = (n: bigint) => (n % 2n === 0n ? n / 2n : -(n + 1n) / 2n);

/** Szudzik's pairing: the square of side s holds exactly the numbers below s², so the centre gets the small ones. */
const pair = (a: bigint, b: bigint) => (a < b ? b * b + a : a * a + a + b);

function unpair(n: bigint): [bigint, bigint] {
  const s = isqrt(n);
  const r = n - s * s;
  return r < s ? [r, s] : [s, r - s];
}

/** The gallery an address names. */
export function cellOf(hex: string): Cell {
  const n = (UNMIX * ((((addressIndex(hex) - SHIFT) % GALLERIES) + GALLERIES) % GALLERIES)) % GALLERIES;
  const [a, b] = unpair(n);
  return { x: unzig(a), floor: unzig(b) };
}

/**
 * The address of the gallery at a cell. Past the square that holds every address (about 10^4318 galleries out) the
 * Library begins again — "unlimited and cyclical" — so every cell has a gallery.
 */
export function addressOf(cell: Cell): string {
  const n = pair(zig(cell.x), zig(cell.floor)) % GALLERIES;
  return addressAt((MIX * n + SHIFT) % GALLERIES);
}

export const offsetCell = (cell: Cell, dx: number, dfloor: number): Cell => ({ x: cell.x + BigInt(dx), floor: cell.floor + BigInt(dfloor) });

export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.floor === b.floor;

/** "x:floor", the way cells travel in URLs, messages and the database. */
export const cellKey = (cell: Cell): string => `${cell.x}:${cell.floor}`;

export function parseCellKey(key: string): Cell | null {
  const m = /^(-?\d{1,5000}):(-?\d{1,5000})$/.exec(key);
  return m ? { x: BigInt(m[1]), floor: BigInt(m[2]) } : null;
}

/** A random gallery near the centre, where newcomers arrive: 101 columns by 41 floors. */
export function cellNearCentre(random: () => number = Math.random): Cell {
  const around = (r: number) => BigInt(Math.floor(random() * (2 * r + 1)) - r);
  return { x: around(50), floor: around(20) };
}

/** A coordinate for people: as it is up to six digits, then its first digits and its size. */
export function formatCoordinate(z: bigint): string {
  const sign = z < 0n ? "−" : "";
  const digits = (z < 0n ? -z : z).toString();
  if (digits.length <= 6) return sign + digits;
  return `${sign}${digits[0]}.${digits.slice(1, 3)}·10^${digits.length - 1}`;
}
/** The map and the fog of war cut the Library into chunks of 32 columns by 32 floors. */
export const CHUNK = 32n;

const floorDiv = (a: bigint, b: bigint) => (a >= 0n ? a / b : -((-a + b - 1n) / b));
const floorMod = (a: bigint, b: bigint) => ((a % b) + b) % b;

export const chunkOf = (cell: Cell): Cell => ({ x: floorDiv(cell.x, CHUNK), floor: floorDiv(cell.floor, CHUNK) });

/** Key of the chunk a gallery is in. */
export const chunkKeyOf = (cell: Cell): string => cellKey(chunkOf(cell));

/** Bit of a gallery in its chunk: column first, then floor. */
export const cellBit = (cell: Cell): number => Number(floorMod(cell.x, CHUNK) + CHUNK * floorMod(cell.floor, CHUNK));

/** The gallery of bit `bit` of a chunk. */
export const bitCell = (chunk: Cell, bit: number): Cell => ({
  x: chunk.x * CHUNK + BigInt(bit % 32),
  floor: chunk.floor * CHUNK + BigInt(Math.floor(bit / 32)),
});

export const parseChunkKey = parseCellKey;

/** The address a visitor without one arrives at. */
export const spawnHex = (): string => addressOf(cellNearCentre());
