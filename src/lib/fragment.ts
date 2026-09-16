import { LIBRARY } from "./library";

/** A run of characters on one page: offsets into the page's text, the end exclusive (as in `String.slice`). */
export interface TextFragment {
  page: number;
  start: number;
  end: number;
}

const FRAGMENT_PATTERN = /^(\d{1,9}):(\d{1,9})-(\d{1,9})$/;

/**
 * Reads the `text` parameter of a reader link, `<page>:<start>-<end>`. Anything malformed, a page the
 * volume does not have or an empty run gives null; offsets past the end of a page are pulled back to it.
 */
export function parseFragment(raw: string | null | undefined): TextFragment | null {
  const m = raw ? FRAGMENT_PATTERN.exec(raw.trim()) : null;
  if (!m) return null;
  const page = Number(m[1]);
  if (page < 1 || page > LIBRARY.pages) return null;
  const start = Math.min(Number(m[2]), LIBRARY.pageLength);
  const end = Math.min(Number(m[3]), LIBRARY.pageLength);
  return end > start ? { page, start, end } : null;
}

export const formatFragment = (f: TextFragment) => `${f.page}:${f.start}-${f.end}`;

export function sameFragment(a: TextFragment | null, b: TextFragment | null): boolean {
  return a === b || (!!a && !!b && a.page === b.page && a.start === b.start && a.end === b.end);
}

/**
 * The fragment of the reader: `mark` is the fragment kept marked (and shared), `live` the part of the text
 * being selected right now. Once a selection ends, whatever it covered becomes the mark.
 */
export interface FragmentState {
  mark: TextFragment | null;
  live: TextFragment | null;
}

export type FragmentAction =
  /** The selection in the text panel was read again; null once nothing is selected. */
  | { type: "select"; fragment: TextFragment | null }
  /** The selection is let go of on purpose (a page turn, "show", "copy link"): it becomes the mark now. */
  | { type: "settle" }
  | { type: "clear" };

export function fragmentReducer(state: FragmentState, action: FragmentAction): FragmentState {
  switch (action.type) {
    case "select":
      if (sameFragment(state.live, action.fragment)) return state;
      return action.fragment ? { ...state, live: action.fragment } : { mark: state.live ?? state.mark, live: null };
    case "settle":
      return state.live ? { mark: state.live, live: null } : state;
    case "clear":
      return state.mark || state.live ? { mark: null, live: null } : state;
  }
}

/** The fragment shown everywhere at once, in the 3D book, the text panel and the link: the selection while there is one. */
export const shownFragment = (state: FragmentState): TextFragment | null => state.live ?? state.mark;

/** Attribute of the element that holds the text of a page; its value is the page number. */
export const PAGE_TEXT_ATTR = "data-page-text";

/**
 * The part of a selection that lies in the text of one page under `root`, as offsets into that text.
 * The text may be split into several nodes (highlights), so offsets are measured as the length of the
 * text from the start of the page up to each end of the selection. A selection that runs over both pages
 * keeps the page holding more of it; one that touches no page text gives null.
 */
export function fragmentFromSelection(root: Element, selection: Selection | null): TextFragment | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  let best: TextFragment | null = null;
  for (const el of root.querySelectorAll<HTMLElement>(`[${PAGE_TEXT_ATTR}]`)) {
    const page = Number(el.getAttribute(PAGE_TEXT_ATTR));
    const length = el.textContent?.length ?? 0;
    if (!Number.isInteger(page) || length === 0) continue;
    const whole = document.createRange();
    whole.selectNodeContents(el);
    let start: number;
    let end: number;
    try {
      // -1: the point lies before this page's text, 1: after it, 0: inside.
      const from = whole.comparePoint(range.startContainer, range.startOffset);
      const to = whole.comparePoint(range.endContainer, range.endOffset);
      if (from > 0 || to < 0) continue;
      start = from < 0 ? 0 : textBefore(el, range.startContainer, range.startOffset);
      end = to > 0 ? length : textBefore(el, range.endContainer, range.endOffset);
    } catch {
      continue;
    }
    if (end > start && (!best || end - start > best.end - best.start)) best = { page, start, end };
  }
  return best;
}

/** Length of the text of `el` in front of a boundary point inside it. */
function textBefore(el: Node, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(el, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}
