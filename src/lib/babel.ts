import { createHash } from "crypto";
import type { BabelConfig, BabelLibrary } from "./types";
import { ALPHABETS, normalizeText } from "./alphabet";
import { DIGS, LIBRARY } from "./library";
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
 * A Library over `config.alphabet`. Every symbol of a page is one digit of the address, shifted by
 * a keystream seeded from the location (wall, shelf, volume, page), so the mapping works both ways:
 * `search` writes a text into an address, `getPage` reads it back. Shifts are taken modulo the size
 * of the alphabet, which may be smaller than the number of digits.
 */
export function createBabel(config?: Partial<BabelConfig>): BabelLibrary {
  const cfg: BabelConfig = { ...DEFAULT_CONFIG, ...config };
  const { digs, alphabet, lengthOfPage, lengthOfTitle } = cfg;
  const size = alphabet.length;
  if (size > digs.length) throw new Error(`an alphabet of ${size} symbols needs at least as many digits`);

  const digsIndexes: Record<string, number> = {};
  const alphabetIndexes: Record<string, number> = {};

  for (let i = 0; i < digs.length; i++) {
    digsIndexes[digs[i]] = i;
  }
  for (let i = 0; i < size; i++) {
    alphabetIndexes[alphabet[i]] = i;
  }

  /** Writes `text` (already in the alphabet) as digits under the keystream of `locHash`. */
  const encode = (text: string, locHash: number): string => {
    const rng = createRng(locHash);
    let hex = "";
    for (let i = 0; i < text.length; i++) {
      let digit = mod((alphabetIndexes[text[i]] ?? 0) + Math.floor(rng.next(0, size)), size);
      // Digits past the alphabet's size read as the same symbols; using them too makes found
      // addresses look like any other.
      if (digit + size < digs.length && Math.random() < 0.5) digit += size;
      hex += digs[digit];
    }
    return hex;
  };

  /** Reads the digits of `hex` back into symbols under the keystream of `locHash`, padded to `length`. */
  const decode = (hex: string, locHash: number, length: number): string => {
    const rng = createRng(locHash);
    let result = "";
    for (let i = 0; i < hex.length; i++) {
      result += alphabet[mod((digsIndexes[hex[i]] ?? 0) - Math.floor(rng.next(0, size)), size)];
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
      // Only the Library's own symbols can be encoded. Spaces stay as they are: exact search pads with them.
      searchStr = normalizeText(searchStr, alphabet, false).slice(0, lengthOfPage);
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
