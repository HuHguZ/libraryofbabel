// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ROW, galleryCenter } from "@/components/explore/geometry";
import type { View } from "@/lib/online/protocol";
import { DELAY, placeAvatar, poseChanged, presenceOf, viewOf, type Sample } from "./presence";

const walk: View = { kind: "walk", wall: 1 };
const here = { col: 3, level: -1, cell: { x: 103n, floor: 9n } }; // the world's anchor is (100, 10)
const sample = (t: number, x: bigint, floor: bigint, p: [number, number, number], yaw = 0): Sample => ({ t, cell: { x, floor }, p, yaw, view: walk });

describe("presenceOf", () => {
  it("sends the eye relative to the visitor's gallery, and the gallery itself", () => {
    const [cx, cy, cz] = galleryCenter(3, -1);
    const pose = presenceOf(here, new THREE.Vector3(cx + 1, cy + 1.6, cz - 2), 7, walk);
    expect(pose).toEqual({ cell: "103:9", p: [1, 1.6, -2], yaw: expect.closeTo(7 - 2 * Math.PI, 3), view: walk });
  });
});

describe("viewOf", () => {
  it("names the wall faced while walking, 0 for a doorway", () => {
    expect(viewOf({ kind: "walk", hex: "x", wall: 1 }, Math.atan2(-Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)), 0)).toEqual({ kind: "walk", wall: 1 });
  });
  it("names the page being read", () => {
    const book = { hex: "x", wall: 2, shelf: 3, volume: 4 };
    expect(viewOf({ kind: "desk", book, mode: "read" }, 0, 20)).toEqual({ kind: "desk", wall: 2, shelf: 3, volume: 4, page: 40 });
    expect(viewOf({ kind: "desk", book, mode: "read" }, 0, 0)).toEqual({ kind: "desk", wall: 2, shelf: 3, volume: 4, page: 1 });
    expect(viewOf({ kind: "desk", book, mode: "index" }, 0, 20)).toEqual({ kind: "desk", wall: 2, shelf: 3, volume: 4, page: 0 });
  });
});

describe("poseChanged", () => {
  const a = { cell: "0:0", p: [0, 1.6, 0] as [number, number, number], yaw: 0, view: walk };
  it("ignores jitter and notices steps, turns, galleries and views", () => {
    expect(poseChanged(a, { ...a, p: [0.01, 1.6, 0] })).toBe(false);
    expect(poseChanged(a, { ...a, p: [0.05, 1.6, 0] })).toBe(true);
    expect(poseChanged(a, { ...a, yaw: 0.05 })).toBe(true);
    expect(poseChanged(a, { ...a, cell: "1:0" })).toBe(true);
    expect(poseChanged(a, { ...a, view: { kind: "walk", wall: 2 } })).toBe(true);
  });
  it("notices live selection, colour and loupe changes and their removal", () => {
    const reading = { fragment: { page: 4, start: 2, end: 8, color: "#abcdef" }, loupe: { page: 4, u: 0.2, v: 0.3, power: 3 } };
    const readingPose = { ...a, view: { kind: "desk" as const, wall: 1, shelf: 2, volume: 3, page: 4 }, reading };
    expect(poseChanged(readingPose, { ...readingPose, reading: structuredClone(reading) })).toBe(false);
    expect(poseChanged(readingPose, { ...readingPose, reading: { ...reading, fragment: { ...reading.fragment, end: 9 } } })).toBe(true);
    expect(poseChanged(readingPose, { ...readingPose, reading: { ...reading, fragment: { ...reading.fragment, color: "#112233" } } })).toBe(true);
    expect(poseChanged(readingPose, { ...readingPose, reading: { ...reading, loupe: { ...reading.loupe, u: 0.25 } } })).toBe(true);
    expect(poseChanged(readingPose, { ...readingPose, reading: { fragment: reading.fragment } })).toBe(true);
    expect(poseChanged(readingPose, { ...readingPose, reading: undefined })).toBe(true);
  });
});

describe("placeAvatar", () => {
  it("blends between the poses either side of now − DELAY", () => {
    const track = [sample(0, 103n, 9n, [0, 1.6, 0]), sample(100, 103n, 9n, [1, 1.6, 0])];
    const placed = placeAvatar(track, here, 50 + DELAY)!;
    const [cx, cy] = galleryCenter(3, -1);
    expect(placed.x).toBeCloseTo(cx + 0.5, 6);
    expect(placed.y).toBeCloseTo(cy + 1.6, 6);
    expect(placed.speed).toBeCloseTo(10, 6);
  });

  it("draws a visitor two galleries along, not three, and nobody on another floor", () => {
    expect(placeAvatar([sample(0, 105n, 9n, [0, 1.6, 0])], here, 1000)).not.toBeNull();
    expect(placeAvatar([sample(0, 106n, 9n, [0, 1.6, 0])], here, 1000)).toBeNull();
    expect(placeAvatar([sample(0, 103n, 11n, [0, 1.6, 0])], here, 1000)).toBeNull();
    expect(placeAvatar([sample(0, 10n ** 300n, 9n, [0, 1.6, 0])], here, 1000)).toBeNull();
  });

  it("snaps instead of sliding when a visitor jumps", () => {
    const track = [sample(0, 103n, 9n, [0, 1.6, 0]), sample(100, 104n, 9n, [0, 1.6, 0])];
    const placed = placeAvatar(track, here, 10 + DELAY)!;
    const [cx] = galleryCenter(4, -1);
    expect(placed.x).toBeCloseTo(cx, 6);
    expect(ROW.period).toBeGreaterThan(3);
  });

  it("turns the short way round", () => {
    const track = [sample(0, 103n, 9n, [0, 1.6, 0], 3), sample(100, 103n, 9n, [0, 1.6, 0], -3)];
    expect(Math.abs(placeAvatar(track, here, 50 + DELAY)!.yaw)).toBeGreaterThan(3);
  });
});
