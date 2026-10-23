import * as THREE from "three";
import { galleryCenter, facingSide, sideWall } from "@/components/explore/geometry";
import type { StageView } from "@/components/explore/stage/stageStore";
import { cellKey } from "@/lib/world";
import type { Pose, View } from "@/lib/online/protocol";
import type { Cell } from "@/lib/world";

/** A pose of another visitor as it arrived (t: performance.now() at arrival). */
export interface Sample {
  t: number;
  cell: Cell;
  p: [number, number, number];
  yaw: number;
  view: View;
}

/** The last few poses of one visitor, oldest first. */
export type Track = Sample[];

const TRACK_LENGTH = 4;

export function addSample(track: Track, sample: Sample): void {
  track.push(sample);
  if (track.length > TRACK_LENGTH) track.shift();
}
/** How far behind the newest pose the others are drawn, so there is nearly always a pose on each side to blend (ms). */
export const DELAY = 100;
/** Others are drawn this many galleries along the row, within one floor of the visitor. */
const SEEN_COLS = 2n;
/** A move faster than this between two poses is a jump (a teleport, a new world): the avatar snaps (m/s). */
const JUMP_SPEED = 30;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const round = (n: number) => Math.round(n * 1000) / 1000;

/** The visitor's pose for the others: their gallery, their eye in it, where they look, what they do. */
export function presenceOf(place: { col: number; level: number; cell: Cell }, eye: THREE.Vector3Like, yaw: number, view: View): Pose {
  const [cx, cy, cz] = galleryCenter(place.col, place.level);
  return { cell: cellKey(place.cell), p: [round(eye.x - cx), round(eye.y - cy), round(eye.z - cz)], yaw: round(wrap(yaw)), view };
}

/** What a stage view looks like to the others. `spread` is the reader's spread (the page is its even page). */
export function viewOf(view: StageView, yaw: number, spread: number): View {
  if (view.kind === "walk") return { kind: "walk", wall: sideWall(facingSide(yaw)) };
  if (view.kind === "shelf") return { kind: "shelf", wall: view.wall, shelf: view.shelf };
  const { wall, shelf, volume } = view.book;
  return { kind: "desk", wall, shelf, volume, page: view.mode === "read" ? Math.max(1, spread * 2) : 0 };
}

const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

/** Worth sending: a step of 2 cm, a turn of 0.01 rad, another gallery or another view. */
export function poseChanged(a: Pose, b: Pose): boolean {
  return (
    a.cell !== b.cell ||
    Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) > 0.02 ||
    Math.abs(wrap(a.yaw - b.yaw)) > 0.01 ||
    !sameView(a.view, b.view)
  );
}

export interface Placed {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  view: View;
}

/** A sample's eye in the visitor's world, or null when it is out of sight from the visitor's gallery. */
function eyeOf(s: Sample, place: { col: number; level: number; cell: Cell }): [number, number, number] | null {
  const dcol = s.cell.x - place.cell.x;
  const dfloor = s.cell.floor - place.cell.floor;
  if (dfloor < -1n || dfloor > 1n || dcol < -SEEN_COLS || dcol > SEEN_COLS) return null;
  const [cx, cy, cz] = galleryCenter(place.col + Number(dcol), place.level + Number(dfloor));
  return [cx + s.p[0], cy + s.p[1], cz + s.p[2]];
}

/** Where to draw another visitor now, blended between their poses either side of now − DELAY; null when out of sight. */
export function placeAvatar(track: Track | undefined, place: { col: number; level: number; cell: Cell }, now: number): Placed | null {
  if (!track?.length) return null;
  const t = now - DELAY;
  let b = track.findIndex((s) => s.t > t);
  if (b === -1) b = track.length - 1;
  const a = Math.max(0, b - 1);
  const sa = track[a];
  const sb = track[b];
  const pb = eyeOf(sb, place);
  if (!pb) return null;
  const pa = eyeOf(sa, place);
  const dt = (sb.t - sa.t) / 1000;
  const dist = pa ? Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) : Infinity;
  if (!pa || dt <= 0 || dist / dt > JUMP_SPEED || t >= sb.t) {
    return { x: pb[0], y: pb[1], z: pb[2], yaw: sb.yaw, speed: 0, view: sb.view };
  }
  const f = THREE.MathUtils.clamp((t - sa.t) / (sb.t - sa.t), 0, 1);
  return {
    x: pa[0] + (pb[0] - pa[0]) * f,
    y: pa[1] + (pb[1] - pa[1]) * f,
    z: pa[2] + (pb[2] - pa[2]) * f,
    yaw: sa.yaw + wrap(sb.yaw - sa.yaw) * f,
    speed: dist / dt,
    view: f < 0.5 ? sa.view : sb.view,
  };
}
