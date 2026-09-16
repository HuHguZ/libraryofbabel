import { findMatches } from "./alphabet";

/** One occurrence of the searched phrase: the page it is on and where it starts in that page's text. */
export interface MatchSpot {
  page: number;
  start: number;
}

/** Every occurrence of the phrase on the given pages, in reading order: page by page, top to bottom. */
export function spreadMatches(pages: number[], contents: Record<number, string>, query: string): MatchSpot[] {
  if (!query) return [];
  return [...pages].sort((a, b) => a - b).flatMap((page) => findMatches(contents[page] ?? "", query).map((start) => ({ page, start })));
}

/** The occurrence `dir` steps from `index`, going round from the last to the first and back; 0 when there are none. */
export function stepMatch(index: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return 0;
  return (((index + dir) % count) + count) % count;
}
