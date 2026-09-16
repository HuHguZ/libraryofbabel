import { describe, expect, it } from "vitest";
import { LIBRARY } from "@/lib/library";
import { TEXT_LAYOUT, layoutPage, pageLines } from "./bookPages";

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
