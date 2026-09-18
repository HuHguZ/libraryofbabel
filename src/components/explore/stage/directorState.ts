import * as THREE from "three";
import { sideAngle, sideYaw, viewpointForSide, type GallerySide } from "../geometry";
import { galleryToWorld, galleryYaw } from "./deskFrame";
import { nearestYaw, type CameraShot, type WalkPose } from "./poses";
import { reversed, type Timeline } from "./timeline";
import type { BookAddress, StageView } from "./stageStore";
import type { Controller } from "./transitions";

/*
 * The director's pure decisions: given a view, a controller or a flight's ends, what does the stage show or
 * become — no refs, no store, no three.js scene graph. Kept apart from Director.tsx so they can be tested
 * without mounting a canvas.
 */

/** A world is built around its address: the visitor starts in gallery A of level 0. */
export const START = { level: 0, side: "a" } as const;

/** A book on the stage, lying open on its desk or in the air (two during a neighbour swap). */
export interface StagedBook {
  book: BookAddress;
  mode: "index" | "read";
  /**
   * Wall (1..5) of the desk the book lies on or flies to or from: the desk across from its own wall when it is taken,
   * but a neighbour from the next wall comes to the desk the reader is at.
   */
  desk: number;
  /** Drawn. Of a swap's two books only the one off its shelf is: the other waits unseen while its volume still stands there. */
  shown: boolean;
}

/** The parts of a flight `flyingBooks` and `closeupOf` read: its ends, the books it carries, and which of a swap's is shown. */
export interface FlightEnds {
  from: Controller;
  to: Controller;
  first: BookAddress | null;
  second: BookAddress | null;
  desk: number;
  staged: 0 | 1;
}

export const bookKey = (book: BookAddress): string => `${book.hex}-${book.wall}-${book.shelf}-${book.volume}`;

export const sameBook = (a: BookAddress, b: BookAddress): boolean => bookKey(a) === bookKey(b);

/** The controller a published view puts the stage into. */
export function controllerFor(view: StageView): Controller {
  if (view.kind === "walk") return { kind: "walk" };
  if (view.kind === "shelf") return { kind: "shelf", wall: view.wall, shelf: view.shelf };
  return { kind: "desk", book: view.book, mode: view.mode };
}

/** Whether two controllers put the stage in the same state (same kind, and same wall/shelf or book/mode). */
export function sameController(a: Controller, b: Controller): boolean {
  if (a.kind === "walk") return b.kind === "walk";
  if (a.kind === "shelf") return b.kind === "shelf" && a.wall === b.wall && a.shelf === b.shelf;
  return b.kind === "desk" && a.mode === b.mode && sameBook(a.book, b.book);
}

/** Where a visitor who comes in by a wall's address stands: across the shaft from that wall, facing it. */
export function acrossFromWall(wall: number): WalkPose {
  const [x, y, z] = viewpointForSide(wall - 1);
  return { position: galleryToWorld(START.level, START.side, { x, y, z }), yaw: sideYaw(wall - 1) + galleryYaw(START.side), pitch: -0.04 };
}

/** The book of a desk state, lying open on the desk of wall `desk`. */
export const restingBooks = (state: Controller, desk: number): StagedBook[] =>
  state.kind === "desk" ? [{ book: state.book, mode: state.mode, desk, shown: true }] : [];

/** The shelf a state looks at close up. */
export const closeupAt = (state: Controller): { wall: number; shelf: number } | null =>
  state.kind === "shelf" ? { wall: state.wall, shelf: state.shelf } : null;

/** A flight shows the close-up it goes to from its start, and the one it leaves until it lands, when the camera has left it. */
export const closeupOf = (f: Pick<FlightEnds, "from" | "to">): { wall: number; shelf: number } | null => closeupAt(f.to) ?? closeupAt(f.from);

/** The books a flight has on the stage, each in the mode of the desk state it leaves or lands in. */
export function flyingBooks(f: FlightEnds): StagedBook[] {
  const modeOf = (book: BookAddress) =>
    f.to.kind === "desk" && sameBook(f.to.book, book) ? f.to.mode : f.from.kind === "desk" && sameBook(f.from.book, book) ? f.from.mode : "index";
  const books: StagedBook[] = [];
  if (f.first) books.push({ book: f.first, mode: modeOf(f.first), desk: f.desk, shown: f.staged === 0 });
  if (f.second) books.push({ book: f.second, mode: modeOf(f.second), desk: f.desk, shown: f.staged === 1 });
  return books;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Horizontal world direction from wall 1..5 of a gallery into its room. */
export function intoRoom(side: GallerySide, wall: number): THREE.Vector3 {
  const a = sideAngle(wall - 1);
  return new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)).applyAxisAngle(Y_AXIS, galleryYaw(side));
}

/** The yaw and pitch (rotation order "YXZ") a shot looks along, the yaw whole turns nearest `near`. */
export function shotAngles(shot: CameraShot, near: number): { yaw: number; pitch: number } {
  const d = new THREE.Vector3().subVectors(shot.target, shot.position).normalize();
  return { yaw: nearestYaw(near, Math.atan2(-d.x, -d.z)).yaw, pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) };
}

/** A flight's clock: how far into `timeline` it is, and, mid-reversal, the one it interrupted and where. */
export interface FlightClock {
  t: number;
  timeline: Timeline;
  undoing: { timeline: Timeline; t: number } | null;
}

/**
 * Turning a flight round: reversed if it wasn't (remember where, then play `timeline` backwards from `t`), or,
 * turned round again, continuing the original timeline from where the reversal had brought it back to —
 * `undoing.t − t`, because the reversal has by now played for `t` seconds off a clock that itself started
 * at `undoing.t`.
 */
export function reverseClock(clock: FlightClock): FlightClock {
  if (clock.undoing) return { t: clock.undoing.t - clock.t, timeline: clock.undoing.timeline, undoing: null };
  return { t: 0, timeline: reversed(clock.timeline, clock.t), undoing: { timeline: clock.timeline, t: clock.t } };
}
