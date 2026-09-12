/** The 36 symbols of this Library: the Russian alphabet, the space, the comma and the full stop. */
export const ALPHABET = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя, .";

const ALLOWED = new Set(Array.from(ALPHABET));

/**
 * Brings a phrase into the Library's alphabet: lower-cases it, folds whitespace into single
 * spaces and drops every symbol the Library cannot contain. (Anything else would be encoded
 * as a full stop and could never be found on the page.) Leading/trailing spaces are kept so
 * callers that pad text can rely on the exact length.
 */
export function normalizeQuery(text: string): string {
  return Array.from(text.toLowerCase().replace(/\s+/g, " "))
    .filter((c) => ALLOWED.has(c))
    .join("");
}

/** Distinct symbols of `text` that the Library's alphabet lacks (for a hint next to the search box). */
export function foreignSymbols(text: string): string[] {
  const seen = new Set<string>();
  for (const c of text.toLowerCase()) {
    if (!ALLOWED.has(c) && !/\s/.test(c)) seen.add(c);
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
