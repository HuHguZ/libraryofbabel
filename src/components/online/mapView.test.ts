// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLOOR_RATIO, cellAtPoint, pan, pointOf, viewAround, visibleChunks, zoomAt } from "./mapView";

const W = 800;
const H = 600;
const FAR = { x: 10n ** 4000n + 3n, floor: -(10n ** 4000n) };

describe("mapView", () => {
  it("puts the centre gallery's middle at the canvas centre", () => {
    const view = viewAround({ x: 5n, floor: -2n }, 20);
    expect(pointOf(view, W, H, { x: 5n, floor: -2n })).toEqual([W / 2, H / 2]);
    expect(pointOf(view, W, H, { x: 6n, floor: -2n })).toEqual([W / 2 + 20, H / 2]);
    expect(pointOf(view, W, H, { x: 5n, floor: -1n })).toEqual([W / 2, H / 2 - 20 * FLOOR_RATIO]);
  });

  it("finds the gallery under a pixel, even 10^4000 galleries out", () => {
    for (const centre of [{ x: 0n, floor: 0n }, FAR]) {
      const view = viewAround(centre, 16);
      expect(cellAtPoint(view, W, H, W / 2, H / 2)).toEqual(centre);
      expect(cellAtPoint(view, W, H, W / 2 + 16 * 3, H / 2)).toEqual({ x: centre.x + 3n, floor: centre.floor });
      expect(cellAtPoint(view, W, H, W / 2, H / 2 + 16 * FLOOR_RATIO * 2)).toEqual({ x: centre.x, floor: centre.floor - 2n });
    }
  });

  it("pans with the drag: what was under the pointer stays under it", () => {
    const view = viewAround(FAR, 16);
    const under = cellAtPoint(view, W, H, 100, 100);
    const moved = pan(view, 37, -21);
    expect(cellAtPoint(moved, W, H, 137, 79)).toEqual(under);
    expect(moved.fx >= 0 && moved.fx < 1 && moved.ff >= 0 && moved.ff < 1).toBe(true);
  });

  it("zooms about the pointer, within limits", () => {
    const view = viewAround({ x: 0n, floor: 0n }, 16);
    const [px, py] = pointOf(view, W, H, { x: 7n, floor: 3n });
    const zoomed = zoomAt(view, 2, px, py, W, H);
    expect(zoomed.scale).toBe(32);
    const [qx, qy] = pointOf(zoomed, W, H, { x: 7n, floor: 3n });
    expect(qx).toBeCloseTo(px, 6);
    expect(qy).toBeCloseTo(py, 6);
    expect(zoomAt(view, 100, px, py, W, H).scale).toBe(48);
    expect(zoomAt(view, 0.01, px, py, W, H).scale).toBe(4);
  });

  it("lists the chunks on screen, few enough for one watch at the widest zoom", () => {
    expect(visibleChunks(viewAround({ x: 0n, floor: 0n }, 48), W, H)).toEqual(expect.arrayContaining(["0:0", "-1:-1", "0:-1", "-1:0"]));
    expect(visibleChunks(viewAround(FAR, 8), 1600, 900).length).toBeLessThanOrEqual(64);
  });

  it("puts what is too far for any screen at infinity", () => {
    expect(pointOf(viewAround({ x: 0n, floor: 0n }, 16), W, H, FAR)[0]).toBe(Infinity);
  });
});
