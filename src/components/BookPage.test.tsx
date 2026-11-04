import { describe, expect, it } from "vitest";
import { segmentText } from "./BookPage";
import BookPage from "./BookPage";
import { render, cleanup } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { system } from "@/lib/theme";

const pieces = (content: string, query: string, mark: { start: number; end: number } | null, current: number | null) =>
  segmentText(content, query, mark, current).map((s) => [s.text, [s.match && "match", s.current && "current", s.mark && "mark"].filter(Boolean).join(" ")]);

describe("segmentText", () => {
  it("keeps the current search result visible over a saved highlight", () => {
    render(<ChakraProvider value={system}><BookPage content="abcdef" highlight="bc" current={1} highlights={[{ start: 0, end: 6, color: "#123456" }]} /></ChakraProvider>);
    const mark = document.querySelector<HTMLElement>("mark[data-current]")!;
    expect(mark.style.background).toContain("232, 118, 22");
    expect(mark.style.background).toContain("18, 52, 86");
    cleanup();
  });
  it("keeps both authors' colours where saved highlights overlap", () => {
    const highlights = [{ start: 1, end: 4, color: "#123456" }, { start: 3, end: 5, color: "#abcdef" }];
    expect(segmentText("abcdef", "", null, null, highlights).map(s => [s.text, s.colors])).toEqual([
      ["a", []], ["bc", ["#123456"]], ["d", ["#123456", "#abcdef"]], ["e", ["#abcdef"]], ["f", []],
    ]);
  });
  it("marks out the occurrence the reader is at among the others", () => {
    expect(pieces("аб вг аб вг аб", "аб", null, 6)).toEqual([
      ["аб", "match"],
      [" вг ", ""],
      ["аб", "match current"],
      [" вг ", ""],
      ["аб", "match"],
    ]);
  });

  it("has no current occurrence until one is given", () => {
    expect(pieces("аб аб", "аб", null, null).some(([, kind]) => kind.includes("current"))).toBe(false);
  });

  it("keeps the current occurrence and the marked fragment apart where they overlap", () => {
    expect(pieces("аб вг аб", "аб", { start: 4, end: 7 }, 6)).toEqual([
      ["аб", "match"],
      [" в", ""],
      ["г ", "mark"],
      ["а", "match current mark"],
      ["б", "match current"],
    ]);
  });
});
