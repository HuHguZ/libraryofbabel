import { createHash } from "crypto";
import type { BabelConfig, BabelLibrary } from "./types";
import { ALPHABETS, normalizeText } from "./alphabet";
import { DIGS, LIBRARY, addressPacking, digitsFor } from "./library";
import { defaultLocale, isLocale, type Locale } from "@/i18n/locales";

const DEFAULT_CONFIG: BabelConfig = {
  lengthOfPage: LIBRARY.pageLength,
  lengthOfTitle: LIBRARY.titleLength,
  digs: DIGS,
  alphabet: ALPHABETS[defaultLocale],
  wall: LIBRARY.walls,
  shelf: LIBRARY.shelves,
  volume: LIBRARY.volumes,
  page: LIBRARY.pages,
};

function sha512(str: string): string {
  return createHash("sha512").update(str).digest("hex");
}

function getHash(str: string): number {
  return parseInt(sha512(str).slice(0, 7), 16);
}

/** Mulberry32 PRNG — better distribution than LCG, deterministic */
function createRng(seed: number) {
  let s = seed;
  return {
    next(min: number = 0, max: number = 1): number {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return min + value * (max - min);
    },
    get seed() {
      return s;
    },
    set seed(v: number) {
      s = v;
    },
  };
}

function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

function pad(s: string, size: number): string {
  return s.padStart(size, "0");
}

/**
 * A Library over `config.alphabet`. Every symbol of a page is shifted by a keystream seeded from the
 * location (wall, shelf, volume, page) and the shifted symbols are written as address digits, a block
 * at a time (see `addressPacking`), so the mapping works both ways: `search` writes a text into an
 * address, `getPage` reads it back.
 */
export function createBabel(config?: Partial<BabelConfig>): BabelLibrary {
  const cfg: BabelConfig = { ...DEFAULT_CONFIG, ...config };
  const { digs, alphabet, lengthOfPage, lengthOfTitle } = cfg;
  const size = alphabet.length;
  const base = digs.length;
  const { chars: blockChars, digits: blockDigits } = addressPacking(size, base);

  const digsIndexes: Record<string, number> = {};
  const alphabetIndexes: Record<string, number> = {};

  for (let i = 0; i < base; i++) {
    digsIndexes[digs[i]] = i;
  }
  for (let i = 0; i < size; i++) {
    alphabetIndexes[alphabet[i]] = i;
  }

  /** Symbols held by a short last block of `width` digits: the most whose block is no wider. */
  const tailChars = Array.from({ length: blockDigits }, (_, width) => {
    let chars = 0;
    while (chars + 1 < blockChars && digitsFor(size, chars + 1, base) <= width) chars++;
    return chars;
  });

  /** Writes symbol numbers as digits: `blockDigits` digits for every `blockChars` symbols, fewer for the rest. */
  const pack = (symbols: number[]): string => {
    let hex = "";
    for (let at = 0; at < symbols.length; at += blockChars) {
      const count = Math.min(blockChars, symbols.length - at);
      const width = count === blockChars ? blockDigits : digitsFor(size, count, base);
      let value = 0;
      for (let i = at; i < at + count; i++) value = value * size + symbols[i];
      // A block of digits can count past the symbols it holds, and every such value reads the same;
      // landing on one of them at random makes a found address look like any other.
      const span = size ** count;
      value += span * Math.floor(Math.random() * (Math.floor((base ** width - 1 - value) / span) + 1));
      let block = "";
      for (let i = 0; i < width; i++) {
        block = digs[value % base] + block;
        value = Math.floor(value / base);
      }
      hex += block;
    }
    return hex;
  };

  /** Reads digits back into symbol numbers (any string of digits reads as something). */
  const unpack = (hex: string): number[] => {
    const symbols: number[] = [];
    for (let at = 0; at < hex.length; at += blockDigits) {
      const width = Math.min(blockDigits, hex.length - at);
      const count = width === blockDigits ? blockChars : tailChars[width];
      let value = 0;
      for (let i = at; i < at + width; i++) value = value * base + (digsIndexes[hex[i]] ?? 0);
      value %= size ** count;
      const run: number[] = new Array(count);
      for (let i = count - 1; i >= 0; i--) {
        run[i] = value % size;
        value = Math.floor(value / size);
      }
      symbols.push(...run);
    }
    return symbols;
  };

  /** Writes `text` (already in the alphabet) as digits under the keystream of `locHash`. */
  const encode = (text: string, locHash: number): string => {
    const rng = createRng(locHash);
    const symbols: number[] = new Array(text.length);
    for (let i = 0; i < text.length; i++) {
      symbols[i] = mod((alphabetIndexes[text[i]] ?? 0) + Math.floor(rng.next(0, size)), size);
    }
    return pack(symbols);
  };

  /** Reads the digits of `hex` back into symbols under the keystream of `locHash`, padded to `length`. */
  const decode = (hex: string, locHash: number, length: number): string => {
    const rng = createRng(locHash);
    let result = "";
    for (const symbol of unpack(hex)) {
      result += alphabet[mod(symbol - Math.floor(rng.next(0, size)), size)];
    }
    const rng2 = createRng(getHash(result));
    while (result.length < length) {
      result += alphabet[Math.floor(rng2.next(0, size))];
    }
    return result.substring(result.length - length);
  };

  return {
    config: cfg,

    search(searchStr: string): string {
      // Only the Library's own symbols can be encoded.
      searchStr = normalizeText(searchStr, alphabet).slice(0, lengthOfPage);
      const w = `${((Math.random() * cfg.wall + 1) ^ 0)}`;
      const sh = `${((Math.random() * cfg.shelf + 1) ^ 0)}`;
      const vol = pad(`${((Math.random() * cfg.volume + 1) ^ 0)}`, 2);
      const pg = pad(`${((Math.random() * cfg.page + 1) ^ 0)}`, 3);

      const depth = (Math.random() * (lengthOfPage - searchStr.length)) ^ 0;
      for (let i = 0; i < depth; i++) {
        searchStr = alphabet[(Math.random() * size) ^ 0] + searchStr;
      }

      const hex = encode(searchStr, getHash(`${w}${sh}${vol}${pg}`));
      return `${hex}-${w}-${sh}-${+vol}-${+pg}`;
    },

    searchExactly(text: string): string {
      text = normalizeText(text, alphabet).slice(0, lengthOfPage);
      const pos = (Math.random() * (lengthOfPage - text.length)) ^ 0;
      const padded = `${" ".repeat(pos)}${text}${" ".repeat(lengthOfPage - (pos + text.length))}`;
      return this.search(padded);
    },

    searchTitle(searchStr: string): string {
      const w = `${((Math.random() * cfg.wall + 1) ^ 0)}`;
      const sh = `${((Math.random() * cfg.shelf + 1) ^ 0)}`;
      const vol = pad(`${((Math.random() * cfg.volume + 1) ^ 0)}`, 2);

      searchStr = normalizeText(searchStr, alphabet).substring(0, lengthOfTitle).padEnd(lengthOfTitle, " ");
      const hex = encode(searchStr, getHash(`${w}${sh}${vol}`));
      return `${hex}-${w}-${sh}-${+vol}`;
    },

    getPage(address: string): string {
      const parts = address.split("-");
      return decode(parts[0], getHash(`${parts[1]}${parts[2]}${pad(parts[3], 2)}${pad(parts[4], 3)}`), lengthOfPage);
    },

    getTitle(address: string): string {
      const parts = address.split("-");
      return decode(parts[0], getHash(`${parts[1]}${parts[2]}${pad(parts[3], 2)}`), lengthOfTitle);
    },
  };
}

const libraries = new Map<Locale, BabelLibrary>();

/** The Library of a language (`lang` from a request body; anything unknown means the default one). */
export function libraryFor(lang: unknown): BabelLibrary {
  const locale = isLocale(lang) ? lang : defaultLocale;
  let library = libraries.get(locale);
  if (!library) {
    library = createBabel({ alphabet: ALPHABETS[locale] });
    libraries.set(locale, library);
  }
  return library;
}
