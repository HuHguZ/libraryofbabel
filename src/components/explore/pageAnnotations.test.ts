import { expect, it } from "vitest";
import { annotationBands } from "./pageAnnotations";
it("splits a live selection at page lines without rebuilding its text texture", () => {
  const bands = annotationBands("a".repeat(160), 78, 84, text => text.length * 10);
  expect(bands).toHaveLength(2);
  expect(bands[0]).toMatchObject({ x: 889, width: 22 });
  expect(bands[1]).toMatchObject({ x: 109, width: 42 });
  expect(bands[1].y - bands[0].y).toBeCloseTo(23.4);
});
