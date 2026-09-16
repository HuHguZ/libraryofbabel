import { describe, expect, it } from "vitest";
import { segmentText } from "./BookPage";

const pieces = (content: string, query: string, mark: { start: number; end: number } | null, current: number | null) =>
  segmentText(content, query, mark, current).map((s) => [s.text, [s.match && "match", s.current && "current", s.mark && "mark"].filter(Boolean).join(" ")]);

describe("segmentText", () => {
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
