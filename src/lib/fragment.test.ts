import { describe, expect, it } from "vitest";
import {
  PAGE_TEXT_ATTR,
  formatFragment,
  fragmentFromSelection,
  fragmentReducer,
  parseFragment,
  shownFragment,
  type FragmentState,
  type TextFragment,
} from "./fragment";

const empty: FragmentState = { mark: null, live: null };
const f = (page: number, start: number, end: number): TextFragment => ({ page, start, end });

describe("parseFragment / formatFragment", () => {
  it("reads what it writes", () => {
    expect(parseFragment(formatFragment(f(9, 100, 180)))).toEqual(f(9, 100, 180));
  });

  it("pulls offsets past the end of a page back to it", () => {
    expect(parseFragment("9:4700-99999")).toEqual(f(9, 4700, 4819));
  });

  it.each(["", "abc", "999:0-10", "0:0-10", "9:50-10", "9:10-10", "9:-1-5"])("ignores %j", (raw) => {
    expect(parseFragment(raw)).toBeNull();
  });
});

describe("fragmentReducer", () => {
  it("follows the selection and marks it once it ends", () => {
    let s = fragmentReducer(empty, { type: "select", fragment: f(9, 100, 120) });
    s = fragmentReducer(s, { type: "select", fragment: f(9, 100, 180) });
    expect(s).toEqual({ mark: null, live: f(9, 100, 180) });
    s = fragmentReducer(s, { type: "select", fragment: null });
    expect(s).toEqual({ mark: f(9, 100, 180), live: null });
  });

  it("keeps the old mark while a new selection is made, then replaces it", () => {
    let s: FragmentState = { mark: f(8, 0, 10), live: null };
    s = fragmentReducer(s, { type: "select", fragment: f(9, 5, 50) });
    expect(s.mark).toEqual(f(8, 0, 10));
    expect(shownFragment(s)).toEqual(f(9, 5, 50));
    s = fragmentReducer(s, { type: "select", fragment: null });
    expect(s).toEqual({ mark: f(9, 5, 50), live: null });
  });

  it("returns the same state when nothing changes, so React skips the render", () => {
    const s: FragmentState = { mark: f(8, 0, 10), live: f(9, 1, 2) };
    expect(fragmentReducer(s, { type: "select", fragment: f(9, 1, 2) })).toBe(s);
    expect(fragmentReducer(empty, { type: "settle" })).toBe(empty);
    expect(fragmentReducer(empty, { type: "clear" })).toBe(empty);
    expect(fragmentReducer(empty, { type: "select", fragment: null })).toBe(empty);
  });

  // Regression: select text, turn the page, turn back. The selection was dropped silently with its page,
  // the 3D book kept showing it and the text panel lost it.
  it("marks the selection when the page is turned, so the book and the panel agree after turning back", () => {
    let s = fragmentReducer(empty, { type: "select", fragment: f(9, 100, 180) });
    s = fragmentReducer(s, { type: "settle" }); // turn forward
    s = fragmentReducer(s, { type: "settle" }); // and back
    expect(s).toEqual({ mark: f(9, 100, 180), live: null });
    expect(shownFragment(s)).toEqual(s.mark);
  });

  it("clears both the mark and the selection", () => {
    expect(fragmentReducer({ mark: f(8, 0, 10), live: f(9, 1, 2) }, { type: "clear" })).toEqual(empty);
  });
});

describe("fragmentFromSelection", () => {
  /** Two pages of text, the right one split into several nodes the way highlights split it. */
  function renderPages() {
    const root = document.createElement("div");
    root.innerHTML = `
      <p>Page 8</p>
      <div ${PAGE_TEXT_ATTR}="8">abcdefghij</div>
      <p>Page 9</p>
      <div ${PAGE_TEXT_ATTR}="9">klm<mark>nop</mark>qr<mark data-fragment>stu</mark>vwxyz</div>`;
    document.body.replaceChildren(root);
    return root;
  }

  function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  }

  const textOf = (root: Element, page: number) => root.querySelector(`[${PAGE_TEXT_ATTR}="${page}"]`)!;

  it("measures offsets across the nodes the text is split into", () => {
    const root = renderPages();
    const page = textOf(root, 9);
    const nop = page.querySelector("mark")!.firstChild!; // "nop" starts at 3
    const stu = page.querySelector("mark[data-fragment]")!.firstChild!; // "stu" starts at 8
    const selection = select(nop, 1, stu, 2);
    expect(fragmentFromSelection(root, selection)).toEqual(f(9, 4, 10));
    expect(selection.toString()).toBe("opqrst");
  });

  it("cuts a selection that starts outside the text to where the text begins", () => {
    const root = renderPages();
    const label = root.querySelectorAll("p")[1].firstChild!;
    const selection = select(label, 2, textOf(root, 9).firstChild!, 2);
    expect(fragmentFromSelection(root, selection)).toEqual(f(9, 0, 2));
  });

  it("keeps the page holding more of a selection that runs over both", () => {
    const root = renderPages();
    const selection = select(textOf(root, 8).firstChild!, 8, textOf(root, 9).firstChild!, 3);
    expect(fragmentFromSelection(root, selection)).toEqual(f(9, 0, 3));
  });

  it("gives null for a collapsed selection or one outside the text", () => {
    const root = renderPages();
    expect(fragmentFromSelection(root, select(textOf(root, 8).firstChild!, 4, textOf(root, 8).firstChild!, 4))).toBeNull();
    const label = root.querySelector("p")!.firstChild!;
    expect(fragmentFromSelection(root, select(label, 0, label, 4))).toBeNull();
  });
});
