import type { Locale } from "@/i18n/locales";

const LATIN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CYRILLIC = "абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";
/** Every printable ASCII mark, so links, keys and code can be written down. */
const ASCII_MARKS = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/** The symbols of each Library, grouped the way the home page counts them. */
export const ALPHABET_PARTS = {
  ru: {
    letters: CYRILLIC,
    latin: LATIN,
    digits: "0123456789",
    punctuation: `${ASCII_MARKS}—…«»`,
  },
  en: {
    letters: LATIN,
    latin: "",
    digits: "0123456789",
    punctuation: `${ASCII_MARKS}—…`,
  },
} as const satisfies Record<Locale, { letters: string; latin: string; digits: string; punctuation: string }>;

/** All symbols of a Library: letters of both cases, the space, the line break, the marks and the digits. */
export const ALPHABETS: Record<Locale, string> = {
  ru: `${ALPHABET_PARTS.ru.letters}${ALPHABET_PARTS.ru.latin} \n${ALPHABET_PARTS.ru.punctuation}${ALPHABET_PARTS.ru.digits}`,
  en: `${ALPHABET_PARTS.en.letters} \n${ALPHABET_PARTS.en.punctuation}${ALPHABET_PARTS.en.digits}`,
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

/** A tab is written as this many spaces, so indented code keeps its shape. */
const TAB = "    ";

const symbolSets = new Map<string, Set<string>>();

function symbolsOf(alphabet: string): Set<string> {
  let set = symbolSets.get(alphabet);
  if (!set) {
    set = new Set(Array.from(alphabet));
    symbolSets.set(alphabet, set);
  }
  return set;
}

/** Line ends become "\n", tabs become spaces, any other whitespace becomes a space; letters are composed (е + ̈ = ё). */
function unifyWhitespace(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?|[\u2028\u2029\v\f]/g, "\n")
    .replace(/\t/g, TAB)
    .replace(/[^\S\n]/g, " ");
}

/**
 * Brings a text into an alphabet: keeps the case, the spaces and the line breaks as they are, turns
 * typographic variants (curly quotes, en dashes) into the alphabet's own marks and drops every other
 * symbol. The length only changes where symbols are dropped or tabs are spread out.
 */
export function normalizeText(text: string, alphabet: string): string {
  const symbols = symbolsOf(alphabet);
  let out = "";
  for (const c of unifyWhitespace(text)) {
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
  for (const c of unifyWhitespace(text)) {
    if (symbols.has(c) || (FOLDS[c] && symbols.has(FOLDS[c]))) continue;
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
