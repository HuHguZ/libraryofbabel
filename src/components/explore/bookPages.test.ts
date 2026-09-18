import { describe, expect, it } from "vitest";
import { LIBRARY } from "@/lib/library";
import { TEXT_LAYOUT, layoutPage, pageLines, pagesAround, pagesToDraw } from "./bookPages";

const text = (lines: { start: number; end: number }[], content: string) => lines.map((l) => content.slice(l.start, l.end));

describe("pageLines", () => {
  it("wraps a page without line breaks at 80 letters", () => {
    const content = "x".repeat(LIBRARY.pageLength);
    const lines = pageLines(content);
    expect(lines).toHaveLength(Math.ceil(LIBRARY.pageLength / 80));
    expect(lines.every((l) => l.end - l.start <= 80 && !l.brk)).toBe(true);
  });

  it("breaks lines where the text does, keeping empty lines and leaving the breaks out", () => {
    const content = "if (a) {\n  b();\n\n}\n";
    const lines = pageLines(content);
    expect(text(lines, content)).toEqual(["if (a) {", "  b();", "", "}", ""]);
    expect(lines.map((l) => l.brk)).toEqual([true, true, true, true, false]);
  });

  it("wraps a long line and breaks only after its last piece", () => {
    const content = `${"a".repeat(170)}\nb`;
    const lines = pageLines(content);
    expect(text(lines, content)).toEqual(["a".repeat(80), "a".repeat(80), "a".repeat(10), "b"]);
    expect(lines.map((l) => l.brk)).toEqual([false, false, true, false]);
  });
});

describe("layoutPage", () => {
  it("keeps the usual type while the lines fit", () => {
    const page = layoutPage("x".repeat(LIBRARY.pageLength));
    expect(page.scale).toBe(1);
    expect(page.fontSize).toBe(TEXT_LAYOUT.fontSize);
  });

  it("sets smaller type with longer lines when line breaks leave too many lines", () => {
    const content = Array.from({ length: 90 }, () => "y".repeat(52)).join("\n");
    const page = layoutPage(content);
    expect(page.scale).toBeLessThan(1);
    expect(page.lines).toHaveLength(90);
    expect(page.lines.length * page.lineHeight).toBeLessThanOrEqual(TEXT_LAYOUT.rows * TEXT_LAYOUT.lineHeight + 1e-6);
    // Just enough: one letter less per line would not fit.
    const cols = Math.round(TEXT_LAYOUT.cols / page.scale);
    expect(pageLines(content, cols - 1).length).toBeGreaterThan(Math.floor((TEXT_LAYOUT.rows * (cols - 1)) / TEXT_LAYOUT.cols));
  });

  it("never lets a page of line breaks run off the paper", () => {
    const page = layoutPage("\n".repeat(LIBRARY.pageLength));
    expect(page.lines.length * page.lineHeight).toBeLessThanOrEqual(TEXT_LAYOUT.rows * TEXT_LAYOUT.lineHeight + 1e-6);
  });
});

describe("pagesAround", () => {
  it("lists the spread's own pages, then the next spread, the one before and the one after next", () => {
    expect(pagesAround(10, 1)).toEqual([20, 21, 22, 23, 18, 19, 24, 25]);
  });

  it("looks the other way for a reader turning back", () => {
    expect(pagesAround(10, -1)).toEqual([20, 21, 18, 19, 22, 23, 16, 17]);
  });
});

describe("pagesToDraw", () => {
  it("draws nothing but the spread ahead while a leaf is still in the air", () => {
    expect(pagesToDraw(150, 1, [2, 3, 297, 298], false)).toEqual([300, 301]);
  });

  it("draws the spread, then what is on show, then the spreads either way once the book lies still", () => {
    // leaves from the front of the book are on show, a long way from the spread the reader has landed at
    const queue = pagesToDraw(150, 1, [4, 5], true);
    expect(queue.slice(0, 2)).toEqual([300, 301]);
    expect(queue).toContain(4);
    expect(queue).toContain(5);
    expect(queue.indexOf(4)).toBeLessThan(queue.indexOf(302));
    expect(queue.indexOf(5)).toBeLessThan(queue.indexOf(302));
    // and the spreads either way are all there, ready for the next turn
    expect(queue).toEqual(expect.arrayContaining([302, 303, 298, 299, 304, 305]));
  });

  it("wants the spread it is heading for first, even with pages on show", () => {
    expect(pagesToDraw(7, 1, [10, 11], true).slice(0, 2)).toEqual([14, 15]);
  });
});
