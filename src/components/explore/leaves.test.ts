import { describe, expect, it } from "vitest";
import { LIBRARY } from "@/lib/library";
import { TURN, TURN_RIFFLE, createLeaves, settledAt, stepLeaves } from "./leaves";

const LEAVES = Math.floor(LIBRARY.pages / 2);

function secondsToSettle(from: number, to: number, params: typeof TURN): number {
  const leaves = createLeaves(LEAVES, from);
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let frame = 1; frame <= 60 * 20; frame++) {
    stepLeaves(leaves, to, 1 / 60, params, random);
    if (settledAt(leaves, to)) return frame / 60;
  }
  return Infinity;
}

describe("riffling through a volume", () => {
  it("reaches any spread from the index within a second and a half", () => {
    for (const to of [13, 60, 120, LEAVES]) expect(secondsToSettle(0, to, TURN_RIFFLE)).toBeLessThanOrEqual(1.5);
  });

  it("comes back to the index as quickly", () => {
    expect(secondsToSettle(LEAVES, 0, TURN_RIFFLE)).toBeLessThanOrEqual(1.5);
  });

  it("is faster than ordinary turning for long jumps", () => {
    expect(secondsToSettle(0, 120, TURN_RIFFLE)).toBeLessThan(secondsToSettle(0, 120, TURN));
  });
});
