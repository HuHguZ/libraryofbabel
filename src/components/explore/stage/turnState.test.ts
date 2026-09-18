import { describe, expect, it } from "vitest";
import { LIBRARY } from "@/lib/library";
import { TURN, TURN_RIFFLE, arrangeLeaves, createLeaves, stepLeaves } from "../leaves";
import { nextDryingStep, nextIndexFace, nextRiffling, type Lying } from "./turnState";

const LEAVES = Math.floor(LIBRARY.pages / 2);
const RIFFLE_FROM = 12;

describe("nextRiffling", () => {
  it("does not start riffling for a jump no longer than the threshold", () => {
    expect(nextRiffling(false, { left: 0, right: 0 }, RIFFLE_FROM, RIFFLE_FROM)).toBe(false);
  });

  it("starts riffling for a jump longer than the threshold", () => {
    expect(nextRiffling(false, { left: 0, right: 0 }, RIFFLE_FROM + 1, RIFFLE_FROM)).toBe(true);
  });

  it("holds TURN_RIFFLE through settling, then drops it", () => {
    const leaves = createLeaves(LEAVES, 0);
    const goal = 100;
    let riffling = nextRiffling(false, { left: 0, right: 0 }, goal, RIFFLE_FROM);
    expect(riffling).toBe(true);
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let frame = 0; frame < 60 * 3; frame++) {
      stepLeaves(leaves, goal, 1 / 60, riffling ? TURN_RIFFLE : TURN, random);
      const arranged = arrangeLeaves(leaves);
      const was: Lying = { left: arranged.left, right: arranged.right };
      riffling = nextRiffling(riffling, was, goal, RIFFLE_FROM);
      if (was.left === was.right && was.left === goal) {
        // Settled: the latch lets go on this very frame, not a frame late.
        expect(riffling).toBe(false);
        return;
      }
      expect(riffling).toBe(true);
    }
    throw new Error("never settled");
  });

  it("keeps riffling when a new jump arrives before the old one has settled", () => {
    // Mid-flight towards a distant goal: some leaves still airborne (left !== right).
    const midFlight: Lying = { left: 40, right: 42 };
    // On its own this short jump would not qualify, but the latch, already set, does not re-ask.
    expect(nextRiffling(true, midFlight, 45, RIFFLE_FROM)).toBe(true);
  });

  it("drops back to ordinary turning once settled at the goal", () => {
    expect(nextRiffling(true, { left: 100, right: 100 }, 100, RIFFLE_FROM)).toBe(false);
  });
});

describe("nextIndexFace", () => {
  it("always shows the index in index mode", () => {
    expect(nextIndexFace(false, "index", 0, 0, 0)).toBe(true);
    expect(nextIndexFace(true, "index", 0.4, 1.2, 12)).toBe(true);
  });

  it("keeps showing the index while leaf 0 is airborne", () => {
    expect(nextIndexFace(true, "read", 0.5, 1.2, 12)).toBe(true);
  });

  it("keeps showing the index while leaf 0 is landing, not yet fully turned", () => {
    // Momentarily stopped (held back by a leaf below it) short of lying flat on the left.
    expect(nextIndexFace(true, "read", 0.98, 0, 12)).toBe(true);
  });

  it("stops once leaf 0 has come to rest fully turned to the left", () => {
    expect(nextIndexFace(true, "read", 1, 0, 12)).toBe(false);
  });

  it("stops at rest when the goal is back to spread 0 (nothing to turn away from)", () => {
    expect(nextIndexFace(true, "read", 0, 0, 0)).toBe(false);
  });

  it("stays off once it has switched off", () => {
    expect(nextIndexFace(false, "read", 1, 0, 12)).toBe(false);
  });
});

describe("nextDryingStep", () => {
  const PAGE_DRYING = 18;

  it("writes while lines are left", () => {
    expect(nextDryingStep({ stale: false, writing: true, since: 0 }, PAGE_DRYING)).toBe("write");
    expect(nextDryingStep({ stale: false, writing: true, since: 1000 }, PAGE_DRYING)).toBe("write");
  });

  it("leaves a written page to dry before taking it in", () => {
    expect(nextDryingStep({ stale: false, writing: false, since: 0 }, PAGE_DRYING)).toBe("wait");
    expect(nextDryingStep({ stale: false, writing: false, since: PAGE_DRYING - 1 }, PAGE_DRYING)).toBe("wait");
    expect(nextDryingStep({ stale: false, writing: false, since: PAGE_DRYING }, PAGE_DRYING)).toBe("take");
  });

  it("drops a page whose picture is already out of date, however far along it is", () => {
    expect(nextDryingStep({ stale: true, writing: true, since: 0 }, PAGE_DRYING)).toBe("drop");
    expect(nextDryingStep({ stale: true, writing: false, since: 1000 }, PAGE_DRYING)).toBe("drop");
  });
});
