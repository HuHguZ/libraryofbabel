import * as THREE from "three";
import { createRandom } from "@/lib/hex";
import type { BookPose, CameraShot } from "./poses";

/*
 * The stage's transitions as pure functions of time, sampled by the director every frame: a take (a volume
 * slides out of its row, flies to a desk, settles and opens while the camera comes down over it), a return
 * (the book closes and flies home while the camera goes back) and a glide (the camera alone).
 */

/** One moment of a transition: `book` is null when only the camera moves; `openness` and `deskLight` run 0..1. */
export interface StageFrame {
  camera: CameraShot;
  book: BookPose | null;
  openness: number;
  deskLight: number;
}

/** `sample` clamps `t` to [0, duration]; given `out`, it fills and returns it, so the frame loop allocates nothing. */
export interface Timeline {
  duration: number;
  sample(t: number, out?: StageFrame): StageFrame;
}

/** Seconds; `reducedMotion` is the factor `scaled` applies for visitors who prefer less motion. */
export const DURATION = { take: 2.0, return: 1.8, glide: 0.9, swapGap: 0.15, reducedMotion: 0.35 } as const;

/** Both ends of a flight; `shelfNormal` points from the book's wall into the room. */
interface FlightInput {
  cameraFrom: CameraShot;
  bookFrom: BookPose;
  bookTo: BookPose;
  shelfNormal: THREE.Vector3;
  cameraTo: CameraShot;
  seed: number;
}

/** Parts of the camera's move over which its aim goes from its first target to the book, then on to its last target. */
interface Aim {
  book: readonly [number, number];
  end: readonly [number, number];
}

const UP = new THREE.Vector3(0, 1, 0);
/** How far a volume slides out of its row, and how high over the desk its flight ends before it settles (m). */
const SLIDE = 0.26;
const HOVER = 0.12;
/** Handles of the flight (m): off the shelf, out and up; over the desk, up and back towards the wall. */
const SHELF_HANDLE = { out: 0.5, up: 0.35 } as const;
const DESK_HANDLE = { up: 0.45, wall: 0.2 } as const;
/** Roll about the way of flight at its middle per unit of trait off 0.5 (rad). */
const ROLL = 0.35;
/**
 * How far the middle of the camera's way rises and bows sideways in a flight, and rises in a glide: at most, and as a
 * share of the way's length (m). Short ways bend less, and a camera held still does not bob.
 */
const CAMERA_LIFT = { max: 0.1, share: 0.25 } as const;
const CAMERA_SWING = { max: 0.3, share: 0.3 } as const;
const GLIDE_LIFT = { max: 0.06, share: 0.1 } as const;
/** The book passes the camera no closer than this (m); it counts as passing on the left once more than ALONG to it. */
const CLEARANCE = 0.6;
const ALONG = 0.02;
/** Bowing moves a flight's handles by this much at most (m), and only where it moves the book by half as much. */
const MAX_BOW = 1;
const BOWABLE = 0.5;
const TAKE_AIM: Aim = { book: [0, 0.25], end: [0.6, 1] };
const RETURN_AIM: Aim = { book: [0, 0.4], end: [0.75, 1] };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** How far `t` is through [a, b]: exactly 0 before and 1 after, so the ends of a timeline are exact. */
const phase = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (2 - 2 * u) ** 3 / 2);
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const smoothstep = (u: number) => u * u * (3 - 2 * u);

function bezier3(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, u: number, out: THREE.Vector3): THREE.Vector3 {
  const s = 1 - u;
  const a = s * s * s;
  const b = 3 * s * s * u;
  const c = 3 * s * u * u;
  const d = u * u * u;
  return out.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z
  );
}

const newPose = (): BookPose => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) });
const newFrame = (): StageFrame => ({
  camera: { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 0, near: 0 },
  book: null,
  openness: 0,
  deskLight: 0,
});
// Timelines keep copies of their ends: the director may hand in vectors it later reuses for frames.
const copyShot = (s: CameraShot): CameraShot => ({ position: s.position.clone(), target: s.target.clone(), fov: s.fov, near: s.near });

/**
 * The camera between two shots: its position on a cubic Bézier (straight until bent), its lens eased with `e`,
 * and the near plane, which spans an order of magnitude between the gallery and the desk, geometrically.
 */
function cameraMove(from: CameraShot, to: CameraShot) {
  const start = copyShot(from);
  const end = copyShot(to);
  const h1 = new THREE.Vector3().lerpVectors(start.position, end.position, 1 / 3);
  const h2 = new THREE.Vector3().lerpVectors(start.position, end.position, 2 / 3);
  return {
    start,
    end,
    /** Moves the middle of the way by `bulge`: a cubic's middle moves by 3/4 of what both inner handles move. */
    bend(bulge: THREE.Vector3) {
      h1.lerpVectors(start.position, end.position, 1 / 3).addScaledVector(bulge, 4 / 3);
      h2.lerpVectors(start.position, end.position, 2 / 3).addScaledVector(bulge, 4 / 3);
    },
    place(e: number, out: CameraShot) {
      bezier3(start.position, h1, h2, end.position, e, out.position);
      out.fov = THREE.MathUtils.lerp(start.fov, end.fov, e);
      out.near = start.near ** (1 - e) * end.near ** e;
    },
  };
}

type CameraMove = ReturnType<typeof cameraMove>;

/** Where a flight's camera looks at progress `u` of its move. */
function aim(camera: CameraMove, u: number, book: THREE.Vector3, parts: Aim, out: THREE.Vector3) {
  out.lerpVectors(camera.start.target, book, smoothstep(phase(u, parts.book[0], parts.book[1])));
  out.lerp(camera.end.target, smoothstep(phase(u, parts.end[0], parts.end[1])));
}

/**
 * A book flying on the Bézier p0..p3 between `start` and `end` seconds: turning from one pose to the other with a
 * seeded roll about its way, its correction scale tweened.
 */
function bookFlight(from: BookPose, to: BookPose, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, start: number, end: number, trait: number) {
  const q0 = from.quaternion.clone();
  const q1 = to.quaternion.clone();
  const s0 = from.scale.clone();
  const s1 = to.scale.clone();
  const way = new THREE.Vector3().subVectors(p3, p0).normalize();
  const roll = way.lengthSq() > 0 ? ROLL * (trait - 0.5) : 0;
  const turn = new THREE.Quaternion();
  const progress = (t: number) => smoothstep(phase(t, start, end));
  return {
    start,
    end,
    way,
    place(t: number, out: BookPose) {
      const u = progress(t);
      bezier3(p0, p1, p2, p3, u, out.position);
      out.quaternion.slerpQuaternions(q0, q1, u);
      // No roll at either end, where the poses must be exact.
      if (u > 0 && u < 1) out.quaternion.premultiply(turn.setFromAxisAngle(way, Math.sin(Math.PI * u) * roll));
      out.scale.lerpVectors(s0, s1, u);
    },
    /** How much of a move of both inner handles reaches the book at time `t` (3/4 at the middle, none at the ends). */
    reach(t: number) {
      const u = progress(t);
      return 3 * u * (1 - u);
    },
    bow(direction: THREE.Vector3, amount: number) {
      p1.addScaledVector(direction, amount);
      p2.addScaledVector(direction, amount);
    },
  };
}

type BookFlight = ReturnType<typeof bookFlight>;

/** When, in the part of the flight that can still be bowed, the book comes closest to the camera. */
function closestPass(timeline: Timeline, flight: BookFlight, frame: StageFrame): { time: number; distance: number } {
  const steps = 90;
  let time = flight.start;
  let distance = Infinity;
  for (let n = 0; n <= steps; n++) {
    const t = flight.start + ((flight.end - flight.start) * n) / steps;
    if (flight.reach(t) < BOWABLE) continue;
    timeline.sample(t, frame);
    const d = frame.book!.position.distanceTo(frame.camera.position);
    if (d < distance) {
      distance = d;
      time = t;
    }
  }
  return { time, distance };
}

/**
 * Keeps book and camera apart. A camera crossing the desk (from the close-up or from across the shaft) meets the
 * book over it, where only the camera can give way: its way rises and bows to the reader's left at `desk`, clear
 * of the closed book (right of its spine) and of the lamp (at the reader's right). Mid-flight the spec's arc often
 * runs through the visitor's head, since a book flies from its shelf past the visitor to the desk behind them:
 * there the middle of the flight bows aside until the book passes the camera at CLEARANCE.
 */
function passApart(timeline: Timeline, flight: BookFlight, camera: CameraMove, desk: BookPose) {
  const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(desk.quaternion).setY(0).normalize();
  const way = new THREE.Vector3().subVectors(camera.end.position, camera.start.position);
  const bulge = new THREE.Vector3(0, Math.min(CAMERA_LIFT.max, CAMERA_LIFT.share * way.length()), 0);
  const flat = way.setY(0);
  const reach = flat.length();
  if (reach > 1e-6) {
    // Sideways to the camera's way only.
    flat.divideScalar(reach);
    const aside = left.clone().addScaledVector(flat, -left.dot(flat));
    bulge.addScaledVector(aside, Math.min(CAMERA_SWING.max, CAMERA_SWING.share * reach));
  }
  camera.bend(bulge);

  // The book bows across its flight, horizontally: to the reader's right, unless it passes the camera on the left.
  const side = new THREE.Vector3(-flight.way.z, 0, flight.way.x);
  if (side.lengthSq() < 1e-12) side.copy(left);
  side.normalize();
  if (side.dot(left) > 0) side.negate();
  const frame = timeline.sample(0);
  const offset = new THREE.Vector3();
  let bowed = 0;
  for (let step = 0; step < 4 && bowed < MAX_BOW; step++) {
    const { time, distance } = closestPass(timeline, flight, frame);
    if (distance >= CLEARANCE) return;
    timeline.sample(time, frame);
    offset.subVectors(frame.book!.position, frame.camera.position);
    if (step === 0 && offset.dot(side) < -ALONG) side.negate();
    const aside = offset.dot(side);
    const needed = Math.sqrt(Math.max(0, CLEARANCE * CLEARANCE - (offset.lengthSq() - aside * aside)));
    // A centimetre over, so the next look finds the pass clear rather than a hair short.
    const bow = Math.min(MAX_BOW - bowed, (needed - aside) / flight.reach(time) + 0.01);
    flight.bow(side, bow);
    bowed += bow;
  }
}

/**
 * Shelf → desk. Seconds: slide out 0–0.30, flight 0.20–1.10, settle 1.10–1.35, open 1.25–1.95, desk light 1.20–1.90,
 * camera 0.10–1.95.
 */
export function takeTimeline(i: FlightInput): Timeline {
  const normal = i.shelfNormal.clone().normalize();
  // The flight runs from the end of the slide to a hand over the desk; the slide and the settle are added to it.
  const p0 = i.bookFrom.position.clone().addScaledVector(normal, SLIDE);
  const p3 = i.bookTo.position.clone().addScaledVector(UP, HOVER);
  const p1 = p0.clone().addScaledVector(normal, SHELF_HANDLE.out).addScaledVector(UP, SHELF_HANDLE.up);
  const p2 = p3.clone().addScaledVector(UP, DESK_HANDLE.up).addScaledVector(normal, -DESK_HANDLE.wall);
  const flight = bookFlight(i.bookFrom, i.bookTo, p0, p1, p2, p3, 0.2, 1.1, createRandom(i.seed)());
  const camera = cameraMove(i.cameraFrom, i.cameraTo);
  const duration = DURATION.take;
  const timeline: Timeline = {
    duration,
    sample(time, out = newFrame()) {
      const t = Math.min(duration, Math.max(0, time));
      const book = (out.book ??= newPose());
      flight.place(t, book);
      book.position.addScaledVector(normal, SLIDE * (easeInOutCubic(phase(t, 0, 0.3)) - 1));
      book.position.addScaledVector(UP, -HOVER * easeOutCubic(phase(t, 1.1, 1.35)));
      const u = phase(t, 0.1, 1.95);
      camera.place(easeInOutCubic(u), out.camera);
      aim(camera, u, book.position, TAKE_AIM, out.camera.target);
      out.openness = easeInOutCubic(phase(t, 1.25, 1.95));
      out.deskLight = smoothstep(phase(t, 1.2, 1.9));
      return out;
    },
  };
  passApart(timeline, flight, camera, i.bookTo);
  return timeline;
}

/**
 * Desk → shelf, the take in reverse order. Seconds: close 0–0.55, desk light out 0.05–0.60, lift 0.45–0.70,
 * flight 0.60–1.50, slide in 1.45–1.75, camera 0–1.75.
 */
export function returnTimeline(i: FlightInput): Timeline {
  const normal = i.shelfNormal.clone().normalize();
  // The flight runs from a hand over the desk to the mouth of the book's gap; the lift and the slide are added to it.
  const p0 = i.bookFrom.position.clone().addScaledVector(UP, HOVER);
  const p3 = i.bookTo.position.clone().addScaledVector(normal, SLIDE);
  const p1 = p0.clone().addScaledVector(UP, DESK_HANDLE.up).addScaledVector(normal, -DESK_HANDLE.wall);
  const p2 = p3.clone().addScaledVector(normal, SHELF_HANDLE.out).addScaledVector(UP, SHELF_HANDLE.up);
  const flight = bookFlight(i.bookFrom, i.bookTo, p0, p1, p2, p3, 0.6, 1.5, createRandom(i.seed)());
  const camera = cameraMove(i.cameraFrom, i.cameraTo);
  const duration = DURATION.return;
  const timeline: Timeline = {
    duration,
    sample(time, out = newFrame()) {
      const t = Math.min(duration, Math.max(0, time));
      const book = (out.book ??= newPose());
      flight.place(t, book);
      book.position.addScaledVector(UP, HOVER * (easeInOutCubic(phase(t, 0.45, 0.7)) - 1));
      book.position.addScaledVector(normal, -SLIDE * easeInOutCubic(phase(t, 1.45, 1.75)));
      const u = phase(t, 0, 1.75);
      camera.place(easeInOutCubic(u), out.camera);
      aim(camera, u, book.position, RETURN_AIM, out.camera.target);
      out.openness = 1 - easeInOutCubic(phase(t, 0, 0.55));
      out.deskLight = 1 - smoothstep(phase(t, 0.05, 0.6));
      return out;
    },
  };
  passApart(timeline, flight, camera, i.bookFrom);
  return timeline;
}

/** The camera alone, from one shot to another on a slightly lifted way, its aim and lens eased. */
export function glideTimeline(from: CameraShot, to: CameraShot, duration: number = DURATION.glide): Timeline {
  const camera = cameraMove(from, to);
  camera.bend(new THREE.Vector3(0, Math.min(GLIDE_LIFT.max, GLIDE_LIFT.share * from.position.distanceTo(to.position)), 0));
  return {
    duration,
    sample(time, out = newFrame()) {
      const e = easeInOutCubic(duration > 0 ? clamp01(time / duration) : 1);
      camera.place(e, out.camera);
      out.camera.target.lerpVectors(camera.start.target, camera.end.target, e);
      out.book = null;
      out.openness = 0;
      out.deskLight = 0;
      return out;
    },
  };
}

/** A moment of a neighbour swap: the departing book's frame, the arriving book's in `incoming`, and which of the two is off its shelf (0: the departing one, 1: the arriving one). */
export interface SwapFrame extends StageFrame {
  incoming: StageFrame;
  phase: 0 | 1;
}

const newSwapFrame = (): SwapFrame => ({ ...newFrame(), incoming: newFrame(), phase: 0 });

/** The three shots of a swap's camera: where the reader left it, the one it watches the flights from, and the desk's home shot. */
export interface SwapCamera {
  from: CameraShot;
  wide: CameraShot;
  home: CameraShot;
}

/** How much of the departure the camera takes to draw back, and how much of the arrival to come home; it waits between the two. */
const SWAP_VIEW = { out: 0.8, back: 0.7 } as const;

/**
 * The camera of a swap. The reader's own shot hangs a hand's breadth over the open book, so a book that leaves the
 * desk leaves the frame with it: the camera draws back instead, to a shot that holds the desk and the wall of shelves
 * together, waits there while the two books change places, and comes home as the new one settles and opens. Its ends
 * are exact — the shot it was handed, and the home shot the reader's orbit takes over. Eased with `smoothstep` rather
 * than the flights' cubic, whose middle is twice as fast: over two metres in under a second that would be a lurch.
 */
function swapView(shots: SwapCamera, duration: number, out: number, back: number) {
  const away = cameraMove(shots.from, shots.wide);
  const home = cameraMove(shots.wide, shots.home);
  return (t: number, frame: CameraShot) => {
    const coming = smoothstep(phase(t, duration - back, duration));
    const leg = coming > 0 ? home : away;
    const e = coming > 0 ? coming : smoothstep(phase(t, 0, out));
    leg.place(e, frame);
    frame.target.lerpVectors(leg.start.target, leg.end.target, e);
  };
}

/**
 * A neighbour swap at the reader's desk: the book on it closes and flies home, and after a breath its neighbour flies
 * in from its own shelf, lands on the same desk and opens. The camera draws back to watch both flights and comes home
 * over the desk for the new book (`swapView`), and the desk lamp stays lit.
 */
export function swapTimeline(departure: Timeline, arrival: Timeline, camera: SwapCamera): Timeline {
  const landed = departure.duration;
  const leaves = landed + DURATION.swapGap;
  const duration = leaves + arrival.duration;
  const view = swapView(camera, duration, departure.duration * SWAP_VIEW.out, arrival.duration * SWAP_VIEW.back);
  return {
    duration,
    sample(time, out = newSwapFrame()) {
      const frame = out as SwapFrame;
      const t = Math.min(duration, Math.max(0, time));
      departure.sample(t, frame);
      arrival.sample(t - leaves, frame.incoming);
      view(t, frame.camera);
      // Mid-breath both books stand still on their shelves: there the one off its shelf changes.
      frame.phase = t < landed + DURATION.swapGap / 2 ? 0 : 1;
      frame.deskLight = 1;
      return frame;
    },
  };
}

/** `timeline` played backwards from the moment `from`: `sample(τ)` is `timeline.sample(from − τ)`. */
export function reversed(timeline: Timeline, from: number): Timeline {
  return {
    duration: from,
    sample: (t, out) => timeline.sample(from - Math.min(from, Math.max(0, t)), out),
  };
}

/** `timeline` taking `factor` times as long (reduced motion shortens it). */
export function scaled(timeline: Timeline, factor: number): Timeline {
  const duration = timeline.duration * factor;
  return {
    duration,
    sample: (t, out) => timeline.sample(factor > 0 ? Math.min(duration, Math.max(0, t)) / factor : timeline.duration, out),
  };
}
