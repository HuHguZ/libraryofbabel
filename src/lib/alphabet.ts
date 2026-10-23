import type { Locale } from "@/i18n/locales";

const LATIN = "abcdefghijklmnopqrstuvwxyz";
const CYRILLIC = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
/** The few marks a sentence needs (Borges' Library had only the comma and the full stop). */
const MARKS = ".,!?-:";

/** The symbols of each Library, grouped the way the home page counts them. */
export const ALPHABET_PARTS = {
  ru: { letters: CYRILLIC, marks: MARKS },
  en: { letters: LATIN, marks: MARKS },
} as const satisfies Record<Locale, { letters: string; marks: string }>;

/**
 * All symbols of a Library: small letters, the space and six marks. The fewer the symbols, the likelier a word turns
 * up by chance: a five-letter word is ~1200 times commoner among 40 symbols than among 166.
 */
export const ALPHABETS: Record<Locale, string> = {
  ru: `${CYRILLIC} ${MARKS}`,
  en: `${LATIN} ${MARKS}`,
};

/** Typographic variants that stand for marks of the alphabet. */
const FOLDS: Record<string, string> = {
  "—": "-",
  "–": "-",
  "‒": "-",
  "―": "-",
  "−": "-",
  "‐": "-",
  "‑": "-",
  "…": "...",
};

const symbolSets = new Map<string, Set<string>>();

function symbolsOf(alphabet: string): Set<string> {
  let set = symbolSets.get(alphabet);
  if (!set) {
    set = new Set(Array.from(alphabet));
    symbolSets.set(alphabet, set);
  }
  return set;
}

/** What one symbol of a text becomes in an alphabet: itself, its small letter, a space, its marks, or nothing (null). */
function fold(c: string, symbols: Set<string>): string | null {
  if (/\s/.test(c)) return symbols.has(" ") ? " " : null;
  if (symbols.has(c)) return c;
  const small = c.toLowerCase();
  if (symbols.has(small)) return small;
  const marks = FOLDS[c];
  return marks && Array.from(marks).every((m) => symbols.has(m)) ? marks : null;
}

/**
 * Brings a text into an alphabet: capitals become small letters, every kind of whitespace (line breaks and tabs too)
 * becomes a space, dashes and the ellipsis become the alphabet's own marks, and every other symbol is dropped.
 */
export function normalizeText(text: string, alphabet: string): string {
  const symbols = symbolsOf(alphabet);
  let out = "";
  for (const c of text.normalize("NFC").replace(/\r\n/g, "\n")) out += fold(c, symbols) ?? "";
  return out;
}

/** A phrase in the alphabet of the Library of `locale`. */
export function normalizeQuery(text: string, locale: Locale): string {
  return normalizeText(text, ALPHABETS[locale]);
}

/** Distinct symbols of `text` that the Library of `locale` cannot hold (for a hint next to the search box). */
export function foreignSymbols(text: string, locale: Locale): string[] {
  const symbols = symbolsOf(ALPHABETS[locale]);
  const seen = new Set<string>();
  for (const c of text.normalize("NFC")) if (fold(c, symbols) === null) seen.add(c);
  return Array.from(seen);
}
/** Start offsets of the non-overlapping occurrences of `query` in `text`. */
export function findMatches(text: string, query: string): number[] {
  if (!query) return [];
  const out: number[] = [];
  let i = text.indexOf(query);
  while (i !== -1) {
    out.push(i);
    i = text.indexOf(query, i + query.length);
  }
  return out;
}
