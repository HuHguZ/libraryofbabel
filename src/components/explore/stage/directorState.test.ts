import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { sideAngle, sideYaw, viewpointForSide } from "../geometry";
import { galleryToWorld, galleryYaw } from "./deskFrame";
import {
  START,
  acrossFromWall,
  closeupAt,
  closeupOf,
  controllerFor,
  flyingBooks,
  intoRoom,
  restingBooks,
  reverseClock,
  sameController,
  shotAngles,
  type FlightClock,
  type FlightEnds,
} from "./directorState";
import type { CameraShot } from "./poses";
import type { Timeline } from "./timeline";
import type { Controller } from "./transitions";

const book = { hex: "babel", wall: 2, shelf: 3, volume: 7 };
const other = { ...book, volume: 8 };
const walk: Controller = { kind: "walk" };
const shelf: Controller = { kind: "shelf", wall: 2, shelf: 3 };
const deskIndex: Controller = { kind: "desk", book, mode: "index" };
const deskRead: Controller = { kind: "desk", book, mode: "read" };

describe("controllerFor", () => {
  it("maps a walk view", () => {
    expect(controllerFor({ kind: "walk", hex: "babel", wall: 1 })).toEqual({ kind: "walk" });
  });

  it("maps a shelf view", () => {
    expect(controllerFor({ kind: "shelf", hex: "babel", wall: 2, shelf: 3 })).toEqual({ kind: "shelf", wall: 2, shelf: 3 });
  });

  it("maps a desk view", () => {
    expect(controllerFor({ kind: "desk", book, mode: "index" })).toEqual({ kind: "desk", book, mode: "index" });
  });
});

describe("sameController", () => {
  it("walk always matches walk", () => {
    expect(sameController(walk, { kind: "walk" })).toBe(true);
  });

  it("shelf matches only the same wall and shelf", () => {
    expect(sameController(shelf, { kind: "shelf", wall: 2, shelf: 3 })).toBe(true);
    expect(sameController(shelf, { kind: "shelf", wall: 2, shelf: 4 })).toBe(false);
    expect(sameController(shelf, { kind: "shelf", wall: 5, shelf: 3 })).toBe(false);
  });

  it("desk matches only the same book and mode", () => {
    expect(sameController(deskIndex, { kind: "desk", book, mode: "index" })).toBe(true);
    expect(sameController(deskIndex, deskRead)).toBe(false);
    expect(sameController(deskIndex, { kind: "desk", book: other, mode: "index" })).toBe(false);
  });

  it("never matches across kinds", () => {
    expect(sameController(walk, shelf)).toBe(false);
    expect(sameController(shelf, deskIndex)).toBe(false);
    expect(sameController(deskIndex, walk)).toBe(false);
  });
});

describe("acrossFromWall", () => {
  it("stands at the walk viewpoint across from the wall, facing it, pitched slightly down", () => {
    for (const wall of [1, 2, 3, 4, 5]) {
      const pose = acrossFromWall(wall);
      const [x, y, z] = viewpointForSide(wall - 1);
      const want = galleryToWorld(START.level, START.side, { x, y, z });
      expect(pose.position.x).toBeCloseTo(want.x, 12);
      expect(pose.position.y).toBeCloseTo(want.y, 12);
      expect(pose.position.z).toBeCloseTo(want.z, 12);
      expect(pose.yaw).toBeCloseTo(sideYaw(wall - 1) + galleryYaw(START.side), 12);
      expect(pose.pitch).toBe(-0.04);
    }
  });
});

describe("restingBooks", () => {
  it("is empty away from a desk", () => {
    expect(restingBooks(walk, 3)).toEqual([]);
    expect(restingBooks(shelf, 3)).toEqual([]);
  });

  it("is the one book, shown, at the given desk", () => {
    expect(restingBooks(deskRead, 4)).toEqual([{ book, mode: "read", desk: 4, shown: true }]);
  });
});

describe("closeupAt / closeupOf", () => {
  it("is the shelf a shelf state looks at, else null", () => {
    expect(closeupAt(shelf)).toEqual({ wall: 2, shelf: 3 });
    expect(closeupAt(walk)).toBeNull();
    expect(closeupAt(deskIndex)).toBeNull();
  });

  it("prefers the flight's destination close-up, falling back to its origin", () => {
    expect(closeupOf({ from: walk, to: shelf })).toEqual({ wall: 2, shelf: 3 });
    expect(closeupOf({ from: shelf, to: walk })).toEqual({ wall: 2, shelf: 3 });
    expect(closeupOf({ from: walk, to: deskIndex })).toBeNull();
  });
});

describe("flyingBooks", () => {
  it("is empty with no books (a glide)", () => {
    expect(flyingBooks({ from: walk, to: shelf, first: null, second: null, desk: 0, staged: 0 })).toEqual([]);
  });

  it("a take shows its one book in the mode it is landing in", () => {
    expect(flyingBooks({ from: walk, to: deskIndex, first: book, second: null, desk: 2, staged: 0 })).toEqual([{ book, mode: "index", desk: 2, shown: true }]);
  });

  it("a return shows its one book in the mode it is leaving", () => {
    expect(flyingBooks({ from: deskRead, to: walk, first: book, second: null, desk: 2, staged: 0 })).toEqual([{ book, mode: "read", desk: 2, shown: true }]);
  });

  it("shows a book as index when neither end has it on a desk", () => {
    const away = flyingBooks({ from: shelf, to: walk, first: book, second: null, desk: 0, staged: 0 });
    expect(away).toEqual([{ book, mode: "index", desk: 0, shown: true }]);
  });

  it("a swap carries both books, only the staged one shown", () => {
    const toOther: Controller = { kind: "desk", book: other, mode: "read" };
    const f: FlightEnds = { from: deskRead, to: toOther, first: book, second: other, desk: 2, staged: 0 };
    expect(flyingBooks(f)).toEqual([
      { book, mode: "read", desk: 2, shown: true },
      { book: other, mode: "read", desk: 2, shown: false },
    ]);
    expect(flyingBooks({ ...f, staged: 1 })).toEqual([
      { book, mode: "read", desk: 2, shown: false },
      { book: other, mode: "read", desk: 2, shown: true },
    ]);
  });
});

describe("intoRoom", () => {
  it("points from the wall into the room, horizontally, as a unit vector", () => {
    for (const wall of [1, 2, 3, 4, 5]) {
      const v = intoRoom("a", wall);
      const a = sideAngle(wall - 1);
      expect(v.y).toBe(0);
      expect(v.x).toBeCloseTo(-Math.cos(a), 12);
      expect(v.z).toBeCloseTo(-Math.sin(a), 12);
      expect(v.length()).toBeCloseTo(1, 12);
    }
  });

  it("turns the other way in a gallery turned a half turn", () => {
    const inA = intoRoom("a", 1);
    const inB = intoRoom("b", 1);
    expect(inB.x).toBeCloseTo(-inA.x, 9);
    expect(inB.z).toBeCloseTo(-inA.z, 9);
  });
});

describe("shotAngles", () => {
  const shotAt = (target: THREE.Vector3): CameraShot => ({ position: new THREE.Vector3(0, 0, 0), target, fov: 50, near: 0.1 });

  it("reads the yaw and pitch of a level shot looking down -z as (0, 0)", () => {
    const { yaw, pitch } = shotAngles(shotAt(new THREE.Vector3(0, 0, -1)), 0);
    expect(yaw).toBeCloseTo(0, 12);
    expect(pitch).toBeCloseTo(0, 12);
  });

  it("reads a look straight up as +pi/2 pitch", () => {
    expect(shotAngles(shotAt(new THREE.Vector3(0, 1, 0)), 0).pitch).toBeCloseTo(Math.PI / 2, 12);
  });

  it("picks the yaw a whole turn nearest a camera that has turned round several times", () => {
    const TURN = Math.PI * 2;
    expect(shotAngles(shotAt(new THREE.Vector3(0, 0, -1)), 5 * TURN).yaw).toBeCloseTo(5 * TURN, 9);
  });
});

describe("reverseClock", () => {
  // A timeline that echoes the time it was sampled at through `openness`, so a reversal's wiring can be
  // checked without needing a real one; `reverseClock` only ever passes `timeline` on to `reversed`.
  const echo: Timeline = {
    duration: 10,
    sample: (t) => ({ camera: { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 0, near: 0 }, book: null, openness: t, deskLight: 0 }),
  };

  it("turns a playing flight round: starts its reversal at 0, remembers where it was", () => {
    const clock: FlightClock = { t: 3, timeline: echo, undoing: null };
    const reversed = reverseClock(clock);
    expect(reversed.t).toBe(0);
    expect(reversed.undoing).toEqual({ timeline: echo, t: 3 });
    // sample(0) of the reversal must land exactly where the original was at t = 3.
    expect(reversed.timeline.sample(0).openness).toBeCloseTo(echo.sample(3).openness, 12);
  });

  it("turning round again continues the original timeline at undoing.t − t", () => {
    const first = reverseClock({ t: 3, timeline: echo, undoing: null });
    // The reversal has since played for 1.2s.
    const midReversal: FlightClock = { t: 1.2, timeline: first.timeline, undoing: first.undoing };
    const second = reverseClock(midReversal);
    expect(second.undoing).toBeNull();
    expect(second.timeline).toBe(echo);
    expect(second.t).toBeCloseTo(3 - 1.2, 12);
  });

  it("turning round twice from a fresh flight returns exactly to where it started", () => {
    const start: FlightClock = { t: 4.5, timeline: echo, undoing: null };
    const there = reverseClock(start);
    const back = reverseClock({ t: 0, timeline: there.timeline, undoing: there.undoing });
    expect(back).toEqual({ t: 4.5, timeline: echo, undoing: null });
  });
});
