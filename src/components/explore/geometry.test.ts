// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ROOM, ROW, STAIR, cellAt, constrainWalk, galleryCenter, sideAngle, sideWall, stairHeightAt, wallSide } from "./geometry";

const along = (col: number, s: number, l: number, level = 0) => {
  const [cx, cy, cz] = galleryCenter(col, level);
  return new THREE.Vector3(cx + ROW.nx * s + ROW.tx * l, cy, cz + ROW.nz * s + ROW.tz * l);
};

/** Walks the feet from `start` towards `goal` in small steps, as the controls do; returns where they end up. */
function walk(start: THREE.Vector3, goal: THREE.Vector3, steps = 3000): THREE.Vector3 {
  const feet = start.clone();
  const step = goal.clone().sub(start).divideScalar(steps);
  for (let i = 0; i < steps; i++) {
    const from = feet.clone();
    feet.add(step);
    feet.y = constrainWalk(feet, from);
  }
  return feet;
}

describe("walls and doors", () => {
  it("put walls 1..4 on sides 0, 1, 3, 4 and doorways on 2 and 5", () => {
    expect([1, 2, 3, 4].map(wallSide)).toEqual([0, 1, 3, 4]);
    expect([0, 1, 2, 3, 4, 5].map(sideWall)).toEqual([1, 2, 0, 3, 4, 0]);
  });
});

describe("a row of galleries", () => {
  it("knows which gallery, or which vestibule, the feet are in", () => {
    for (const [col, level] of [[0, 0], [3, -2], [-7, 5]]) {
      const [x, y, z] = galleryCenter(col, level);
      expect(cellAt({ x, y, z })).toEqual({ level, col, vestibule: false });
    }
    expect(cellAt(along(3, ROOM.apothem + ROOM.vestibuleDepth / 2, 0))).toEqual({ level: 0, col: 3, vestibule: true });
  });

  it("leads east through the vestibule into the next gallery, clear of the stair well", () => {
    const end = walk(along(0, ROOM.apothem - 0.7, 0.4), along(1, -(ROOM.apothem - 0.7), 0.4));
    expect(end.distanceTo(along(1, -(ROOM.apothem - 0.7), 0.4))).toBeLessThan(0.05);
    expect(cellAt(end)).toMatchObject({ col: 1, vestibule: false });
  });

  it("leads west into column −1 just the same", () => {
    const end = walk(along(0, -(ROOM.apothem - 0.7), 0.4), along(-1, ROOM.apothem - 0.7, 0.4));
    expect(cellAt(end)).toMatchObject({ col: -1, vestibule: false });
  });

  it("keeps the walker off the walls of shelves", () => {
    const a = sideAngle(wallSide(1));
    const [cx, , cz] = galleryCenter(4, 0);
    const start = new THREE.Vector3(cx + Math.cos(a) * 2.2, 0, cz + Math.sin(a) * 2.2);
    const end = walk(start, new THREE.Vector3(cx + Math.cos(a) * 6, 0, cz + Math.sin(a) * 6), 400);
    expect((end.x - cx) * Math.cos(a) + (end.z - cz) * Math.sin(a)).toBeLessThan(ROOM.apothem - 0.4);
  });

  it("puts the stair of every vestibule under the feet", () => {
    // In the well of the vestibule east of column 5, on its entry tread.
    const phi = STAIR.arc / 2;
    const feet = along(5, ROOM.apothem - STAIR.z, 0);
    feet.x += ROW.tx * (STAIR.x + Math.cos(phi) * 0.4) + ROW.nx * -Math.sin(phi) * 0.4;
    feet.z += ROW.tz * (STAIR.x + Math.cos(phi) * 0.4) + ROW.nz * -Math.sin(phi) * 0.4;
    feet.y = 0.2;
    const from = feet.clone();
    expect(constrainWalk(feet, from)).toBeCloseTo(stairHeightAt(phi, 0.2), 9);
  });
});
