import type { Locale } from "@/i18n/locales";

/** The symbols of each Library, grouped the way the home page counts them. */
export const ALPHABET_PARTS = {
  ru: {
    letters: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    digits: "0123456789",
    punctuation: ".,!?:;-—…()«»\"'",
  },
  en: {
    letters: "abcdefghijklmnopqrstuvwxyz",
    digits: "0123456789",
    punctuation: ".,!?:;-—…()\"'",
  },
} as const satisfies Record<Locale, { letters: string; digits: string; punctuation: string }>;

/** All symbols of a Library: its letters, the space, the punctuation marks and the digits. */
export const ALPHABETS: Record<Locale, string> = {
  ru: `${ALPHABET_PARTS.ru.letters} ${ALPHABET_PARTS.ru.punctuation}${ALPHABET_PARTS.ru.digits}`,
  en: `${ALPHABET_PARTS.en.letters} ${ALPHABET_PARTS.en.punctuation}${ALPHABET_PARTS.en.digits}`,
};

/** Typographic variants that stand for a symbol of the alphabet (used only when the alphabet lacks the variant itself). */
const FOLDS: Record<string, string> = {
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "«": '"',
  "»": '"',
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "–": "—",
  "‒": "—",
  "―": "—",
  "−": "-",
  "‐": "-",
  "‑": "-",
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

/**
 * Brings a phrase into an alphabet: lower-cases it, turns whitespace into spaces (folding runs of it
 * into one unless `collapseSpaces` is false), turns typographic variants (curly quotes, en dashes)
 * into the alphabet's own marks and drops every other symbol. Leading/trailing spaces are kept so
 * callers that pad text can rely on the exact length.
 */
export function normalizeText(text: string, alphabet: string, collapseSpaces = true): string {
  const symbols = symbolsOf(alphabet);
  let out = "";
  for (const c of text.toLowerCase().replace(collapseSpaces ? /\s+/g : /\s/g, " ")) {
    if (symbols.has(c)) out += c;
    else if (FOLDS[c] && symbols.has(FOLDS[c])) out += FOLDS[c];
  }
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
  for (const c of text.toLowerCase()) {
    if (/\s/.test(c) || symbols.has(c) || (FOLDS[c] && symbols.has(FOLDS[c]))) continue;
    seen.add(c);
  }
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
