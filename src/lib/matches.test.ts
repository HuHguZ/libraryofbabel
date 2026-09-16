import { describe, expect, it } from "vitest";
import { spreadMatches, stepMatch } from "./matches";

describe("spreadMatches", () => {
  const contents = { 8: "аб аб вг", 9: "вг аб" };

  it("lists the occurrences on the left page first, each page top to bottom", () => {
    expect(spreadMatches([9, 8], contents, "аб")).toEqual([
      { page: 8, start: 0 },
      { page: 8, start: 3 },
      { page: 9, start: 3 },
    ]);
  });

  it("skips pages whose text has not arrived and gives nothing for an empty phrase", () => {
    expect(spreadMatches([10, 11], contents, "аб")).toEqual([]);
    expect(spreadMatches([8, 9], contents, "")).toEqual([]);
  });

  it("does not count overlapping occurrences twice", () => {
    expect(spreadMatches([1], { 1: "аааа" }, "аа")).toEqual([
      { page: 1, start: 0 },
      { page: 1, start: 2 },
    ]);
  });
});

describe("stepMatch", () => {
  it("steps forward and back", () => {
    expect(stepMatch(0, 5, 1)).toBe(1);
    expect(stepMatch(3, 5, -1)).toBe(2);
  });

  it("goes round at both ends, as a find bar does", () => {
    expect(stepMatch(4, 5, 1)).toBe(0);
    expect(stepMatch(0, 5, -1)).toBe(4);
    expect(stepMatch(0, 1, 1)).toBe(0);
  });

  it("stays at 0 when there is nothing to step through", () => {
    expect(stepMatch(0, 0, 1)).toBe(0);
    expect(stepMatch(3, 0, -1)).toBe(0);
  });
});
