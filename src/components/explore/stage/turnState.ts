/**
 * Small per-frame rules of DeskBook's page turning, pure and free of three.js so they can be tested
 * without a frame loop: whether this frame riffles or turns normally, whether page 1's front face
 * still shows the index rather than its own text, and what becomes of the page being drawn.
 */

/** Leaves lying left and right, as `lying.current` (arrangeLeaves' own shape) keeps it between frames. */
export interface Lying {
  left: number;
  right: number;
}

/**
 * Whether to riffle (TURN_RIFFLE) rather than turn normally (TURN) this frame. A jump further than
 * `longJump` leaves starts it; once started it latches until the leaves settle at the goal, however the
 * goal moves meanwhile — a fresh short jump that arrives mid-riffle keeps riffling rather than dropping
 * back to an ordinary turn.
 */
export function nextRiffling(riffling: boolean, was: Lying, goal: number, longJump: number): boolean {
  const settled = was.left === was.right && was.left === goal;
  return riffling ? !settled : Math.abs(goal - was.left) > longJump;
}

/**
 * Whether page 1's front face still shows the index rather than its own text, given leaf 0's progress `p`
 * (0 lying right, 1 lying left) and speed `v`. Index mode always shows it; leaving index keeps showing it
 * until leaf 0 comes to rest fully turned to the left, or the goal is back to spread 0 (nothing to turn away
 * from), so the swap never happens while the leaf is still airborne.
 */
export function nextIndexFace(indexFace: boolean, mode: "index" | "read", p: number, v: number, goal: number): boolean {
  if (mode === "index") return true;
  if (indexFace && v === 0 && (p >= 1 || goal === 0)) return false;
  return indexFace;
}

/** What becomes of the page being drawn this frame. */
export type DryingStep = "drop" | "write" | "wait" | "take";

/**
 * What to do with the page being drawn (DeskBook's `carryOn`).
 *
 * A page whose picture is already out of date — the phrase, the mark or the book has moved on — is dropped
 * where it is, so that the page wanted now can be started instead of waiting for this one. Otherwise its text
 * is written while lines are left, and then it is left to dry: a browser draws a page of text in its own time,
 * and reading the canvas back before it has (uploading it) makes the thread wait for the whole page.
 */
export function nextDryingStep(page: { stale: boolean; writing: boolean; since: number }, drying: number): DryingStep {
  if (page.stale) return "drop";
  if (page.writing) return "write";
  return page.since < drying ? "wait" : "take";
}
