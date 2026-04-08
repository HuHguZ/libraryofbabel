import { createHash } from "crypto";
import type { BabelConfig, BabelLibrary } from "./types";

const DEFAULT_CONFIG: BabelConfig = {
  lengthOfPage: 4819,
  lengthOfTitle: 31,
  digs: "0123456789abcdefghijklmnopqrstuvwxyz",
  alphabet: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя, .",
  wall: 5,
  shelf: 7,
  volume: 31,
  page: 421,
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

export function createBabel(config?: Partial<BabelConfig>): BabelLibrary {
  const cfg: BabelConfig = { ...DEFAULT_CONFIG, ...config };
  const { digs, alphabet, lengthOfPage, lengthOfTitle } = cfg;

  const digsIndexes: Record<string, number> = {};
  const alphabetIndexes: Record<string, number> = {};

  for (let i = 0; i < digs.length; i++) {
    digsIndexes[digs[i]] = i;
  }
  for (let i = 0; i < alphabet.length; i++) {
    alphabetIndexes[alphabet[i]] = i;
  }

  return {
    config: cfg,

    search(searchStr: string): string {
      const w = `${((Math.random() * cfg.wall + 1) ^ 0)}`;
      const sh = `${((Math.random() * cfg.shelf + 1) ^ 0)}`;
      const vol = pad(`${((Math.random() * cfg.volume + 1) ^ 0)}`, 2);
      const pg = pad(`${((Math.random() * cfg.page + 1) ^ 0)}`, 3);
      const locHash = getHash(`${w}${sh}${vol}${pg}`);
      let hex = "";

      const depth = (Math.random() * (lengthOfPage - searchStr.length)) ^ 0;
      for (let i = 0; i < depth; i++) {
        searchStr =
          alphabet[(Math.random() * alphabet.length) ^ 0] + searchStr;
      }

      const rng = createRng(locHash);
      for (let i = 0; i < searchStr.length; i++) {
        const index = alphabetIndexes[searchStr[i]] ?? -1;
        const rand = rng.next(0, alphabet.length);
        const newIndex = mod(index + Math.floor(rand), digs.length);
        hex += digs[newIndex];
      }

      return `${hex}-${w}-${sh}-${+vol}-${+pg}`;
    },

    searchExactly(text: string): string {
      const pos = (Math.random() * (lengthOfPage - text.length)) ^ 0;
      const padded = `${" ".repeat(pos)}${text}${" ".repeat(lengthOfPage - (pos + text.length))}`;
      return this.search(padded);
    },

    searchTitle(searchStr: string): string {
      const w = `${((Math.random() * cfg.wall + 1) ^ 0)}`;
      const sh = `${((Math.random() * cfg.shelf + 1) ^ 0)}`;
      const vol = pad(`${((Math.random() * cfg.volume + 1) ^ 0)}`, 2);
      const locHash = getHash(`${w}${sh}${vol}`);
      let hex = "";

      searchStr = searchStr.substring(0, lengthOfTitle);
      if (searchStr.length < lengthOfTitle) {
        searchStr += " ".repeat(lengthOfTitle - searchStr.length);
      }

      const rng = createRng(locHash);
      for (let i = 0; i < searchStr.length; i++) {
        const index = alphabetIndexes[searchStr[i]] ?? 0;
        const rand = rng.next(0, alphabet.length);
        const newIndex = mod(index + Math.floor(rand), digs.length);
        hex += digs[newIndex];
      }

      return `${hex}-${w}-${sh}-${+vol}`;
    },

    getPage(address: string): string {
      const parts = address.split("-");
      const hex = parts[0];
      const locHash = getHash(
        `${parts[1]}${parts[2]}${pad(parts[3], 2)}${pad(parts[4], 3)}`
      );
      let result = "";

      const rng = createRng(locHash);
      for (let i = 0; i < hex.length; i++) {
        const index = digsIndexes[hex[i]] ?? 0;
        const rand = rng.next(0, digs.length);
        const newIndex = mod(index - Math.floor(rand), alphabet.length);
        result += alphabet[newIndex];
      }

      const rng2 = createRng(getHash(result));
      while (result.length < lengthOfPage) {
        result += alphabet[Math.floor(rng2.next(0, alphabet.length))];
      }

      return result.substring(result.length - lengthOfPage);
    },

    getTitle(address: string): string {
      const parts = address.split("-");
      const hex = parts[0];
      const locHash = getHash(
        `${parts[1]}${parts[2]}${pad(parts[3], 2)}`
      );
      let result = "";

      const rng = createRng(locHash);
      for (let i = 0; i < hex.length; i++) {
        const index = digsIndexes[hex[i]] ?? 0;
        const rand = rng.next(0, digs.length);
        const newIndex = mod(index - Math.floor(rand), alphabet.length);
        result += alphabet[newIndex];
      }

      const rng2 = createRng(getHash(result));
      while (result.length < lengthOfTitle) {
        result += alphabet[Math.floor(rng2.next(0, alphabet.length))];
      }

      return result.substring(result.length - lengthOfTitle);
    },
  };
}
