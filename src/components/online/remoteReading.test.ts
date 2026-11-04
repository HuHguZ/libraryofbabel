import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Player } from "@/lib/online/protocol";
import { cellOf, cellKey } from "@/lib/world";
import { deskFrame, visitorAtDesk, BOOK_SCALE, bookMatrix, bookToWorld } from "@/components/explore/stage/deskFrame";
import { deskBookPose } from "@/components/explore/stage/deskFrame";
import { nearbyReaders, readingPosition } from "./remoteReading";

const cell = cellOf("babel");
const place = { col: 0, level: 0, cell };
const make = (id: string, wall = 1): Player => {
  const pose = visitorAtDesk(0, 0, wall);
  return { id, nick: id, color: "#b02e3a", cell: cellKey(cell), p: pose.position.toArray(), yaw: pose.yaw, view: { kind: "desk", wall: 1, shelf: 1, volume: 1, page: 4 } };
};
describe("nearby remote reading", () => {
  it("bounds avatars/books before mounting, uses actual desk positions and is stable under roster reordering", () => {
    const players = Array.from({ length: 200 }, (_, n) => make(`reader-${String(n).padStart(3, "0")}`, n % 4 + 1));
    const first = nearbyReaders(players, new Map(), place);
    expect(first).toHaveLength(24);
    expect(first.filter(p => p.bookSlot !== null)).toHaveLength(8);
    expect(first.filter(p => p.desk === 2).every(p => p.player.view.kind === "desk" && p.player.view.wall === 1)).toBe(true);
    expect(nearbyReaders([...players].reverse(), new Map(), place).map(p => [p.player.id, p.slot, p.bookSlot])).toEqual(first.map(p => [p.player.id, p.slot, p.bookSlot]));
    for (let wall = 1; wall <= 4; wall++) expect(first.filter(p => p.desk === wall)).toHaveLength(6);
  });
  it("uses live track views and never converts distant BigInt coordinates to unsafe numbers", () => {
    const player = make("reader");
    const tracks = new Map([[player.id, [{ t: 1, cell, p: player.p, yaw: 0, view: { kind: "desk" as const, wall: 3, shelf: 2, volume: 4, page: 20 } }]]]);
    const near = nearbyReaders([player], tracks, place)[0];
    expect(near.view).toMatchObject({ wall: 3, page: 20 });
    expect(near.desk).toBe(1);
    expect(nearbyReaders([{ ...player, cell: `${cell.x + 10n ** 100n}:${cell.floor}` }], new Map(), place)).toEqual([]);
  });
  it("separates readers at one desk and turns their bodies toward the book", () => {
    const layout = nearbyReaders([make("a"), make("b"), make("c")], new Map(), place);
    const poses = layout.map(p => readingPosition(p));
    expect(new Set(poses.map(p => `${p.x}:${p.z}`)).size).toBe(3);
    for (let n = 0; n < layout.length; n++) {
      const pose = poses[n], target = deskFrame(0, 0, layout[n].desk!).position;
      const forward = new THREE.Vector3(Math.sin(pose.yaw), 0, Math.cos(pose.yaw));
      const toBook = target.clone().sub(new THREE.Vector3(pose.x, 0, pose.z)).setY(0).normalize();
      expect(forward.dot(toBook)).toBeGreaterThan(0.85);
    }
  });
  it("applies a smaller observer frame's scale to the actual book matrix", () => {
    const frame = deskFrame(0, 0, 1); frame.scale = BOOK_SCALE * 0.65;
    const pose = deskBookPose(frame);
    const point = new THREE.Vector3(1, 0, 1).applyMatrix4(bookMatrix(pose));
    expect(point.distanceTo(bookToWorld(frame, { x: 1, y: 0, z: 1 }))).toBeLessThan(1e-9);
  });
});
