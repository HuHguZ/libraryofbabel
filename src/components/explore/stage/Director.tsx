"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { hashString } from "@/lib/hex";
import { LIBRARY } from "@/lib/library";
import { PULL_OUT, TITLED_PULL_OUT, type BookRef } from "../Bookcase";
import { setCanvasCursor } from "../cursor";
import type { GalleryControlsHandle, GalleryControlsMode } from "../GalleryControls";
import GalleryWorld, { type HiddenVolume, type ShelfDetail } from "../HexGalleryScene";
import type { GallerySide } from "../geometry";
import { LibraryMaterialsProvider } from "../materials";
import { DeskBookWarmUp } from "./bookParts";
import DeskBook, { type BookMotion, type BookOrbit } from "./DeskBook";
import { WALK_NEAR, closeupPose, deskBookPose, deskFrame, deskWatchShot, readerHomeShot, shelfBookPose, visitorAtDesk, walkShot, type DeskFrame } from "./deskFrame";
import {
  START,
  acrossFromWall,
  bookKey,
  closeupAt,
  closeupOf,
  controllerFor,
  flyingBooks,
  intoRoom,
  restingBooks,
  reverseClock,
  sameBook,
  sameController,
  shotAngles,
  type StagedBook,
} from "./directorState";
import { nearestYaw, type BookPose, type CameraShot, type WalkPose } from "./poses";
import { useStageSelector, useStageStore } from "./StageProvider";
import type { BookAddress, DeskInputs, StageHandlers, StageView } from "./stageStore";
import { DURATION, glideTimeline, returnTimeline, scaled, swapTimeline, takeTimeline, type StageFrame, type Timeline } from "./timeline";
import { decideTransition, type Controller } from "./transitions";

const WALK_MODE: GalleryControlsMode = { walk: true, capture: true, pitchRange: [-1.1, 1.1], fovRange: [34, 72] };
const WALK_FOV = 58;
/** The shelf close-up only looks: ±0.55 rad around the wall (added per shelf), a little up and down, zoom. */
const SHELF_MODE: GalleryControlsMode = { walk: false, capture: false, pitchRange: [-0.45, 0.45], fovRange: [26, 62] };
const SHELF_FOV = 50;
/** How brightly a lit desk lamp glows, tuned by eye. */
const DESK_LAMP_INTENSITY = 0.6;
/** A new world lifts the veil once the visitor's gallery (and a book on its desk) is in, or after this long at the latest (ms). */
const VEIL_LIMIT = 1500;
/** A book taken by a click goes back to its shelf unless its page asks for it within this long (ms). */
const TAKE_LIMIT = 3000;
/** The spines of a shelf whose titles have not arrived. */
const NO_TITLES: string[] = Array.from({ length: LIBRARY.volumes }, () => "");
/** What a book shows until its page publishes its own inputs: its index. */
const INDEX_INPUTS: DeskInputs = { title: "", spread: 0, contents: {}, query: "", loupe: false };
/** A flight moves the camera and the books before anything else in the frame reads them: the orbit (-1), the books, the render (1). */
const FLIGHT_PRIORITY = -2;
/** A longer frame (a stall, a tab in the background) moves a flight on by this much only (s). */
const MAX_STEP = 0.1;
/** A neighbour swap plays both of its flights this much faster. */
const SWAP_SPEED = 1.5;

type Place = { level: number; side: GallerySide };

/** The world on the stage: its address, which build of it this is, and where the eye and the visitor start when it mounts. */
interface WorldMount {
  hex: string;
  build: number;
  pose: WalkPose;
  place: Place;
}

/** What the director keeps for a book on the stage. */
interface BookLink {
  /** Written by flights, read by the book every frame. */
  motion: BookMotion;
  /** The book's reader's orbit. */
  orbit: RefObject<BookOrbit | null>;
  /** The desk inputs the store held when a click took the book: another book's, never shown in this one. */
  stale: DeskInputs | null;
}

/** What the director has put on the stage. */
interface Staging {
  world: WorldMount;
  /** The state the stage is in, or the one the flight playing lands in. */
  controller: Controller;
  /** Address of the gallery the controller's state is in. */
  placeHex: string;
  /** That gallery: books lie on its desks and are missing from its shelves. */
  place: Place;
  books: StagedBook[];
  /** The shelf shown close up (titled, under its light): the one the stage is at, is going to, or is flying away from. */
  closeup: { wall: number; shelf: number } | null;
}

/** A moment of a flight: a swap's arriving book in `incoming`, and which of the swap's books is off its shelf (0: the departing one). */
interface FlightFrame extends StageFrame {
  incoming: StageFrame;
  phase: 0 | 1;
}

/** A transition playing. */
interface Flight {
  kind: "take" | "return" | "glide" | "swap";
  timeline: Timeline;
  /** Seconds into `timeline`. */
  t: number;
  /** The state it left and the one it lands in: a view asking for `from` again plays it back from where it is. */
  from: Controller;
  to: Controller;
  /** While this plays another flight backwards: that flight, and how far into it it was when it turned round. */
  undoing: { timeline: Timeline; t: number } | null;
  /** The book in the frame's `book` (taken, returned, or a swap's departing one), and a swap's arriving one. */
  first: BookAddress | null;
  second: BookAddress | null;
  /** Wall of the desk its books fly to or from (a glide has none). */
  desk: number;
  frame: FlightFrame;
  /** The swap phase the stage shows. */
  staged: 0 | 1;
}

type FlightPlan = Pick<Flight, "kind" | "timeline" | "from" | "to" | "first" | "second" | "desk">;

const viewHex = (view: StageView) => (view.kind === "desk" ? view.book.hex : view.hex);

/** The close-up of a shelf, as a shot. */
const closeupShot = (place: Place, wall: number, shelf: number) => walkShot(closeupPose(place.level, place.side, wall, shelf).pose, SHELF_FOV);

const newShot = (): CameraShot => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 0, near: 0 });
const newStageFrame = (): StageFrame => ({ camera: newShot(), book: null, openness: 0, deskLight: 0 });
const newFlightFrame = (): FlightFrame => ({ ...newStageFrame(), incoming: newStageFrame(), phase: 0 });

/** Puts a book where a flight has it, in the book's own pose object. */
function moveBook(motion: BookMotion, pose: BookPose, openness: number) {
  if (motion.pose) {
    motion.pose.position.copy(pose.position);
    motion.pose.quaternion.copy(pose.quaternion);
    motion.pose.scale.copy(pose.scale);
  } else {
    motion.pose = { position: pose.position.clone(), quaternion: pose.quaternion.clone(), scale: pose.scale.clone() };
  }
  motion.openness = openness;
}

/** Visitors who prefer less motion see every flight in a fraction of its time. */
function forVisitor(timeline: Timeline): Timeline {
  const less = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return less ? scaled(timeline, DURATION.reducedMotion) : timeline;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

interface DirectorProps {
  /** The controls of the world on the stage (null while there is none), for the page commands and the console. */
  controlsRef: RefObject<GalleryControlsHandle | null>;
  /** The scene callbacks, fixed for the life of the store. */
  on: Required<StageHandlers>;
  /** Told whether the stage now reads a book (at the desk in read mode), whenever that is decided. */
  onReading: (reading: boolean) => void;
}

/**
 * Decides what each new view does to the stage, and does it: builds the world around the first address, rebuilds it
 * behind the veil for an address the visitor is not in, and otherwise plays a flight within that one world: the camera
 * glides between the walk and the shelf close-ups, a book flies from its shelf to the desk across from its wall and
 * opens, closes and flies home, or swaps places with its neighbour. A flight can be skipped, and turned round by going
 * back to where it started. The world stays on the stage throughout.
 */
export default function Director({ controlsRef, on, onReading }: DirectorProps) {
  const store = useStageStore();
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const view = useStageSelector((s) => s.view);
  const shelfTitles = useStageSelector((s) => s.shelfTitles);
  const moving = useStageSelector((s) => s.moving);

  const controller = useRef<Controller | null>(null);
  const staging = useRef<Staging | null>(null);
  /** Exactly where the visitor stood when they last left the walk (or where a build put them). */
  const visitorPose = useRef<WalkPose | null>(null);
  /** The state to put the controls in when they mount: the world mounts after the decision, and later still while it loads. */
  const pending = useRef<Controller | null>(null);
  /** The veil is up for a world being built, until `liftVeil`. */
  const veiled = useRef(false);
  const veilTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** What the veil still waits for: the visitor's gallery, and the book when the world is built around a desk. */
  const awaited = useRef({ cell: false, book: false });
  const takeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The last view put on the stage: the decision follows changes of the view, not re-runs of the effect. */
  const applied = useRef<StageView | null>(null);
  /** The flight playing, if any. */
  const flight = useRef<Flight | null>(null);
  /** How fast flights play (window.__stage.setTimeScale; 0 holds one still). */
  const timeScale = useRef(1);
  /** What the director keeps for each book on the stage, by book. */
  const links = useRef(new Map<string, BookLink>());
  /** The desk lamp's light, which flights brighten and dim frame by frame. */
  const deskLight = useRef<THREE.PointLight>(null);
  /** The volume under the pointer, pulled out of its row: a click takes it from there. */
  const hovered = useRef<BookRef | null>(null);
  const [shown, setShown] = useState<Staging | null>(null);
  /** Dev-only overlays `window.__stage` sets directly; a book on a desk takes their place. */
  const [hiddenVolume, setHiddenVolume] = useState<HiddenVolume | null>(null);
  const [deskLamp, setDeskLamp] = useState<{ wall: number; intensity: number } | null>(null);

  const linkOf = useCallback((book: BookAddress): BookLink => {
    const key = bookKey(book);
    let link = links.current.get(key);
    if (!link) {
      link = { motion: { pose: null, openness: 1 }, orbit: { current: null }, stale: null };
      links.current.set(key, link);
    }
    return link;
  }, []);

  const stage = useCallback(
    (next: Staging) => {
      staging.current = next;
      // Every book on the stage has its link before it mounts; a book that has left the stage leaves its link behind.
      for (const key of [...links.current.keys()]) if (!next.books.some((b) => bookKey(b.book) === key)) links.current.delete(key);
      for (const b of next.books) linkOf(b.book);
      setShown(next);
      onReading(next.controller.kind === "desk" && next.controller.mode === "read");
    },
    [onReading, linkOf]
  );

  /**
   * Puts the controls into a state: walking or looking (turned by whole turns to stay nearest their yaw), or away from
   * the camera at a desk. Where a flight has landed they take its last shot exactly; otherwise the state's own view.
   */
  const aim = useCallback(
    (controls: GalleryControlsHandle, target: Controller, shot?: CameraShot) => {
      if (target.kind === "desk") {
        // The camera is the book's now; a captured mouse is let go.
        controls.setActive(false);
        return;
      }
      const yaw = controls.getPose().yaw;
      if (target.kind === "walk") {
        const pose = visitorPose.current;
        const eye = shot
          ? { position: shot.position, ...shotAngles(shot, yaw), fov: shot.fov }
          : pose && { position: pose.position, yaw: nearestYaw(yaw, pose.yaw).yaw, pitch: pose.pitch, fov: WALK_FOV };
        if (!eye) return;
        controls.configure(WALK_MODE);
        controls.teleport(eye.position, eye.yaw, eye.pitch, eye.fov);
      } else {
        const place = store.getSnapshot().place ?? START;
        const closeup = closeupPose(place.level, place.side, target.wall, target.shelf);
        const turned = nearestYaw(yaw, closeup.pose.yaw, closeup.yawRange);
        const eye = shot
          ? { position: shot.position, ...shotAngles(shot, turned.yaw), fov: shot.fov }
          : { position: closeup.pose.position, yaw: turned.yaw, pitch: closeup.pose.pitch, fov: SHELF_FOV };
        controls.configure({ ...SHELF_MODE, yawRange: turned.range });
        controls.teleport(eye.position, eye.yaw, eye.pitch, eye.fov);
      }
      controls.setActive(true);
    },
    [store]
  );

  // The controls come and go with the world: a state decided before they mounted is put into them as they do.
  const attachControls = useCallback(
    (handle: GalleryControlsHandle | null) => {
      controlsRef.current = handle;
      const target = pending.current;
      if (!handle || !target) return;
      pending.current = null;
      aim(handle, target);
    },
    [controlsRef, aim]
  );

  /** The reader's view of the whole book on a desk, with the reader's near plane scaled like the book. */
  const lookAtDesk = useCallback(
    (frame: DeskFrame) => {
      const shot = readerHomeShot(frame);
      camera.position.copy(shot.position);
      camera.lookAt(shot.target);
      camera.fov = shot.fov;
      camera.near = shot.near;
      camera.updateProjectionMatrix();
    },
    [camera]
  );

  /** Away from the desk the near plane is the walker's again; the controls set the rest. */
  const leaveDesk = useCallback(() => {
    camera.near = WALK_NEAR;
    camera.updateProjectionMatrix();
  }, [camera]);

  /**
   * Compiles the shaders of what is not in view yet (the vestibule's mirror above all) while the world is still
   * settling, rather than in the middle of the first flight that turns the camera onto them. It adds no programs
   * beyond the ones the world would compile anyway, only earlier and off the main thread.
   *
   * It waits for the visitor's gallery: that cell cannot be ready before `GalleryWorld` — and so the LightPool
   * beside it, which the shaders are compiled against — has mounted, and a world warmed without the pool would
   * have every material compiled lightless and compiled again at the first render.
   */
  const warmShaders = useCallback(() => {
    void gl.compileAsync(scene, camera);
  }, [gl, scene, camera]);

  const liftVeil = useCallback(() => {
    if (!veiled.current) return;
    veiled.current = false;
    if (veilTimer.current !== null) clearTimeout(veilTimer.current);
    veilTimer.current = null;
    store.patch({ ready: true });
    // Once the visitor's gallery is in, its shaders are warmed (see `warmShaders`); a veil lifted by its deadline
    // instead waits for the gallery, and warms them in `cellReady`.
    if (!awaited.current.cell) warmShaders();
  }, [store, warmShaders]);

  /** A new world comes in gallery by gallery: the veil hides that until the visitor's gallery, and the book of a desk, are in. */
  const armVeil = useCallback(
    (book: boolean) => {
      store.patch({ ready: false });
      veiled.current = true;
      awaited.current = { cell: true, book };
      if (veilTimer.current !== null) clearTimeout(veilTimer.current);
      veilTimer.current = setTimeout(liftVeil, VEIL_LIMIT);
    },
    [store, liftVeil]
  );

  const cellReady = useCallback(() => {
    awaited.current.cell = false;
    // A veil already down came down on its deadline, without the gallery: its shaders are warmed now instead.
    if (!veiled.current) warmShaders();
    if (!awaited.current.book) liftVeil();
  }, [liftVeil, warmShaders]);

  const bookReady = useCallback(() => {
    awaited.current.book = false;
    if (!awaited.current.cell) liftVeil();
  }, [liftVeil]);

  /** A world built around a desk that is left before its book has mounted waits for that book no more. */
  const stopAwaitingBook = useCallback(() => {
    if (!awaited.current.book) return;
    awaited.current.book = false;
    if (!awaited.current.cell) liftVeil();
  }, [liftVeil]);

  const clearTakeTimer = useCallback(() => {
    if (takeTimer.current === null) return;
    clearTimeout(takeTimer.current);
    takeTimer.current = null;
  }, []);

  // The timers stop with the director. A veil still up keeps its deadline across an effect cleanup that React runs
  // and runs again at once (StrictMode, as the stage mounts and builds its first world): its timer is set again.
  useEffect(() => {
    if (veiled.current && veilTimer.current === null) veilTimer.current = setTimeout(liftVeil, VEIL_LIMIT);
    return () => {
      if (veilTimer.current !== null) clearTimeout(veilTimer.current);
      veilTimer.current = null;
      if (takeTimer.current !== null) clearTimeout(takeTimer.current);
      takeTimer.current = null;
      // A flight left playing when the director unmounts must not leave the store thinking one still is.
      if (flight.current) store.patch({ moving: false });
    };
  }, [liftVeil, store]);

  /* ── Flights ── */

  /** Writes a moment of a flight to the stage: the camera, the books in the air, the light of the desk lamp. */
  const write = useCallback(
    (f: Flight) => {
      f.timeline.sample(f.t, f.frame);
      const { camera: shot, book, openness, incoming, deskLight: lit } = f.frame;
      camera.position.copy(shot.position);
      camera.lookAt(shot.target);
      camera.fov = shot.fov;
      camera.near = shot.near;
      camera.updateProjectionMatrix();
      if (f.first && book) moveBook(linkOf(f.first).motion, book, openness);
      if (f.second && incoming.book) moveBook(linkOf(f.second).motion, incoming.book, incoming.openness);
      if (f.kind !== "glide" && deskLight.current) deskLight.current.intensity = lit * DESK_LAMP_INTENSITY;
    },
    [camera, linkOf]
  );

  /** The flight lands: a book it brought to the desk lies open there, and whatever takes the camera over takes it from the last shot. */
  const land = useCallback(
    (f: Flight) => {
      if (flight.current !== f) return;
      flight.current = null;
      const to = f.to;
      if (to.kind === "desk") {
        const link = linkOf(to.book);
        link.motion.pose = null;
        link.motion.openness = 1;
        // The reader's orbit looks where the flight left the camera looking.
        link.orbit.current?.target.copy(f.frame.camera.target);
      } else {
        const controls = controlsRef.current;
        if (controls) aim(controls, to, f.frame.camera);
        else pending.current = to;
      }
      hovered.current = null;
      const current = staging.current;
      if (current) stage({ ...current, controller: to, books: restingBooks(to, f.desk), closeup: closeupAt(to) });
      store.patch({ moving: false });
    },
    [store, controlsRef, linkOf, aim, stage]
  );

  /** Shows a moment of a flight: writes it, draws the book a swap has off its shelf, and lands at the end. */
  const play = useCallback(
    (f: Flight) => {
      write(f);
      if (f.frame.phase !== f.staged) {
        f.staged = f.frame.phase;
        const current = staging.current;
        if (current) stage({ ...current, books: flyingBooks(f) });
      }
      if (f.t >= f.timeline.duration) land(f);
    },
    [write, stage, land]
  );

  /** Skipping: the flight jumps to its end and lands. */
  const finish = useCallback(
    (f: Flight) => {
      f.t = f.timeline.duration;
      play(f);
    },
    [play]
  );

  /** Starts a flight from the stage as it is (`at`, in the gallery the flight plays in). */
  const fly = useCallback(
    (plan: FlightPlan, at: Staging, stale: DeskInputs | null = null) => {
      const f: Flight = { ...plan, t: 0, undoing: null, frame: newFlightFrame(), staged: 0 };
      flight.current = f;
      controller.current = f.to;
      hovered.current = null;
      if (f.kind === "take" && f.first) linkOf(f.first).stale = stale;
      store.patch({ moving: true });
      // The books take their first pose before they mount; the camera is still where it was.
      write(f);
      stage({ ...at, controller: f.to, books: flyingBooks(f), closeup: closeupOf(f) });
    },
    [store, linkOf, write, stage]
  );

  /** The flight turns round and plays back to the state it left, from where it is. */
  const reverse = useCallback(
    (f: Flight) => {
      const clock = reverseClock(f);
      f.t = clock.t;
      f.timeline = clock.timeline;
      f.undoing = clock.undoing;
      const left = f.to;
      f.to = f.from;
      f.from = left;
      controller.current = f.to;
      if (f.to.kind !== "desk") stopAwaitingBook();
      const current = staging.current;
      if (current) stage({ ...current, controller: f.to, books: flyingBooks(f), closeup: closeupOf(f) });
    },
    [stage, stopAwaitingBook]
  );

  useFrame((_, dt) => {
    const f = flight.current;
    if (!f) return;
    f.t = Math.min(f.timeline.duration, f.t + Math.min(dt, MAX_STEP) * timeScale.current);
    play(f);
  }, FLIGHT_PRIORITY);

  /**
   * Puts the stage into the state a view asks for. `clicked`: a click took the book; the desk inputs then, and whether
   * the book was under the pointer, pulled out of its row.
   */
  const apply = useCallback(
    (next: StageView, clicked?: { stale: DeskInputs | null; pulled: boolean }) => {
      applied.current = next;
      // Whatever the stage is asked for now, a book taken by a click is no longer waiting for its page.
      clearTakeTimer();
      const target = controllerFor(next);
      const playing = flight.current;
      if (playing) {
        const inPlace = store.getSnapshot().place?.hex === viewHex(next);
        // Already on its way there: the page of the book a click took has asked for it.
        if (inPlace && sameController(target, playing.to)) return;
        // Back where it came from: the flight plays backwards from where it is.
        if (inPlace && sameController(target, playing.from)) {
          reverse(playing);
          return;
        }
        // Anywhere else: it lands at once, and the new transition starts from there.
        finish(playing);
      }

      const snapshot = store.getSnapshot();
      const current = staging.current;
      const transition = decideTransition(controller.current, snapshot.place?.hex ?? null, next);
      if (transition.kind === "none") return;
      if (target.kind !== "desk") stopAwaitingBook();

      if (transition.kind === "build" || transition.kind === "rebuild") {
        const hex = viewHex(next);
        const wall = next.kind === "desk" ? next.book.wall : next.wall;
        armVeil(target.kind === "desk");
        store.patch({ place: { ...START, hex } });
        // A book the stage opens on arrival was taken from nowhere: back from it is the walk.
        if (target.kind === "desk") store.patch({ origin: { kind: "walk" } });
        controller.current = target;
        visitorPose.current = next.kind === "walk" ? acrossFromWall(wall) : visitorAtDesk(START.level, START.side, wall);
        const pose = target.kind === "shelf" ? closeupPose(START.level, START.side, target.wall, target.shelf).pose : visitorPose.current;
        pending.current = target;
        if (target.kind === "desk") lookAtDesk(deskFrame(START.level, START.side, target.book.wall));
        const build = (current?.world.build ?? 0) + 1;
        const world = { hex, build, pose, place: START };
        stage({ world, controller: target, placeHex: hex, place: START, books: restingBooks(target, wall), closeup: closeupAt(target) });
        return;
      }

      const place = snapshot.place;
      const from = controller.current;
      if (!current || !place || !from) return;
      const controls = controlsRef.current;
      // Leaving the walk: remember exactly where the visitor stood.
      if (from.kind === "walk" && controls) visitorPose.current = controls.getPose();
      const here: Place = { level: place.level, side: place.side };
      const at: Staging = { ...current, placeHex: place.hex, place: here };
      // The desk the reader is at: the one the book on the stage lies on, which a neighbour from the next wall comes to as well.
      const readerDesk = current.books.find((b) => b.shown)?.desk;

      if (transition.kind === "take") {
        store.patch({ origin: from.kind === "shelf" ? { kind: "shelf", wall: from.wall, shelf: from.shelf } : { kind: "walk" } });
        // The volume under the pointer never hears the pointer leave it: the world stops answering.
        setCanvasCursor(gl.domElement, false);
      }
      if (transition.kind === "mode" && target.kind === "desk") {
        // Opened at another page, the book stays under the reader's eye.
        controller.current = target;
        stage({ ...at, controller: target, books: restingBooks(target, readerDesk ?? target.book.wall), closeup: null });
        return;
      }

      const deskAt = (wall: number) => deskFrame(here.level, here.side, wall);
      const shelfOf = (book: BookAddress) => shelfBookPose(here.level, here.side, book.wall, book.shelf, book.volume, hashString(book.hex));
      const seedOf = (book: BookAddress) => hashString(bookKey(book));
      /** The camera as it is: its eye, where the reader's orbit of `book` looks (or straight ahead), its lens. */
      const shotNow = (book: BookAddress): CameraShot => ({
        position: camera.position.clone(),
        target: links.current.get(bookKey(book))?.orbit.current?.target.clone() ?? camera.getWorldDirection(new THREE.Vector3()).add(camera.position),
        fov: camera.fov,
        near: camera.near,
      });
      const visitor = visitorPose.current;
      const walkOrCloseup = (state: Controller) =>
        state.kind === "shelf" ? closeupShot(here, state.wall, state.shelf) : state.kind === "walk" && visitor ? walkShot(visitor, WALK_FOV) : null;

      if (transition.kind === "take" && target.kind === "desk" && controls) {
        const pose = controls.getPose();
        controls.setActive(false);
        const { book } = target;
        const desk = deskAt(book.wall);
        const intoTheRoom = intoRoom(here.side, book.wall);
        // A volume clicked under the pointer stands pulled out of its row (further on the titled close-up shelf).
        const bookFrom = shelfOf(book);
        const titled = from.kind === "shelf" && from.wall === book.wall && from.shelf === book.shelf;
        if (clicked?.pulled) bookFrom.position.addScaledVector(intoTheRoom, titled ? TITLED_PULL_OUT : PULL_OUT);
        const timeline = takeTimeline({
          cameraFrom: walkShot(pose, pose.fov),
          bookFrom,
          bookTo: deskBookPose(desk),
          shelfNormal: intoTheRoom,
          cameraTo: readerHomeShot(desk),
          seed: seedOf(book),
        });
        fly({ kind: "take", timeline: forVisitor(timeline), from, to: target, first: book, second: null, desk: book.wall }, at, clicked?.stale ?? null);
        return;
      }

      const walkTo = walkOrCloseup(target);
      if (transition.kind === "return" && from.kind === "desk" && controls && walkTo) {
        const desk = readerDesk ?? from.book.wall;
        const timeline = returnTimeline({
          cameraFrom: shotNow(from.book),
          bookFrom: deskBookPose(deskAt(desk)),
          bookTo: shelfOf(from.book),
          shelfNormal: intoRoom(here.side, from.book.wall),
          cameraTo: walkTo,
          seed: seedOf(from.book),
        });
        fly({ kind: "return", timeline: forVisitor(timeline), from, to: target, first: from.book, second: null, desk }, at);
        return;
      }

      if (transition.kind === "glide" && controls && walkTo) {
        const pose = controls.getPose();
        controls.setActive(false);
        const timeline = forVisitor(glideTimeline(walkShot(pose, pose.fov), walkTo));
        fly({ kind: "glide", timeline, from, to: target, first: null, second: null, desk: 0 }, at);
        return;
      }

      if (transition.kind === "swap" && from.kind === "desk" && target.kind === "desk") {
        // Both books use the reader's desk; the camera draws back from it to watch them change places, and comes home.
        const desk = readerDesk ?? from.book.wall;
        const frame = deskAt(desk);
        const home = readerHomeShot(frame);
        const cameraFrom = shotNow(from.book);
        const departure = returnTimeline({
          cameraFrom,
          bookFrom: deskBookPose(frame),
          bookTo: shelfOf(from.book),
          shelfNormal: intoRoom(here.side, from.book.wall),
          cameraTo: home,
          seed: seedOf(from.book),
        });
        const arrival = takeTimeline({
          cameraFrom: home,
          bookFrom: shelfOf(target.book),
          bookTo: deskBookPose(frame),
          shelfNormal: intoRoom(here.side, target.book.wall),
          cameraTo: home,
          seed: seedOf(target.book),
        });
        const away = scaled(departure, 1 / SWAP_SPEED);
        const timeline = swapTimeline(away, scaled(arrival, 1 / SWAP_SPEED), { from: cameraFrom, wide: deskWatchShot(frame, WALK_FOV), home });
        fly({ kind: "swap", timeline: forVisitor(timeline), from, to: target, first: from.book, second: target.book, desk }, at);
        return;
      }

      // Without the controls (a world still mounting) the stage cuts straight to the new state; only a take reaches a desk here.
      controller.current = target;
      const desk = target.kind === "desk" ? target.book.wall : 0;
      if (target.kind === "desk") lookAtDesk(deskAt(desk));
      else if (from.kind === "desk") leaveDesk();
      if (controls) {
        pending.current = null;
        aim(controls, target);
      } else {
        pending.current = target;
      }
      if (target.kind === "desk" && clicked) linkOf(target.book).stale = clicked.stale;
      stage({ ...at, controller: target, books: restingBooks(target, desk), closeup: closeupAt(target) });
    },
    [store, gl, camera, controlsRef, aim, stage, armVeil, lookAtDesk, leaveDesk, clearTakeTimer, stopAwaitingBook, linkOf, fly, reverse, finish]
  );

  // A layout effect: the decision, and the pose saved from the controls, come before anything else moves the camera.
  useLayoutEffect(() => {
    if (!view || view === applied.current) return;
    apply(view);
  }, [view, apply]);

  /**
   * A click on a volume takes it at once (in the walk or a close-up, never mid-flight) and asks the page to open
   * it. The page's own view confirms the take; without it the book goes back to its shelf.
   */
  const takeOnClick = useCallback(
    (ref: BookRef) => {
      const from = controller.current;
      const snapshot = store.getSnapshot();
      const place = snapshot.place;
      if ((from?.kind !== "walk" && from?.kind !== "shelf") || snapshot.moving || !place) return;
      const under = hovered.current;
      const pulled = !!under && under.wall === ref.wall && under.shelf === ref.shelf && under.volume === ref.volume;
      apply({ kind: "desk", book: { hex: place.hex, wall: ref.wall, shelf: ref.shelf, volume: ref.volume }, mode: "index" }, { stale: snapshot.desk, pulled });
      takeTimer.current = setTimeout(() => {
        takeTimer.current = null;
        const now = store.getSnapshot().view;
        if (now) apply(now);
      }, TAKE_LIMIT);
      on.onClickBook(ref);
    },
    [store, apply, on]
  );

  useEffect(() => {
    store.commands.lookAt = (yaw, pitch) => controlsRef.current?.lookAt(yaw, pitch);
    return () => {
      delete store.commands.lookAt;
    };
  }, [store, controlsRef]);

  // A flight is skipped by a press on the scene, Space, Enter or Esc, or the page's `commands.skip`: it lands at once.
  useEffect(() => {
    const canvas = gl.domElement;
    const skip = () => {
      const f = flight.current;
      if (f) finish(f);
    };
    store.commands.skip = skip;
    // The click that ends a skipping press is no click on what the landed view shows.
    let swallow = false;
    const onPointerDown = (e: PointerEvent) => {
      swallow = false;
      if (e.target !== canvas || !flight.current) return;
      e.stopPropagation();
      swallow = true;
      skip();
    };
    const onClick = (e: MouseEvent) => {
      if (!swallow || e.target !== canvas) return;
      swallow = false;
      e.stopPropagation();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!flight.current || isTyping(e.target)) return;
      const space = e.code === "Space" || e.key === " ";
      const enter = e.code === "Enter" || e.code === "NumpadEnter" || e.key === "Enter";
      const escape = e.code === "Escape" || e.key === "Escape";
      if (!space && !enter && !escape) return;
      e.preventDefault();
      e.stopPropagation();
      skip();
    };
    // Captured on the window, ahead of the controls, the orbit and the scene's own listeners.
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown, true);
      if (store.commands.skip === skip) delete store.commands.skip;
    };
  }, [gl, store, finish]);

  // Development aid: what the director holds (window.__stage.director), the renderer and the scene (window.__stage.gl.info,
  // __stage.scene), two checks for the reading desks (hiding a volume on its shelf, lighting a desk lamp), and the
  // flights: their speed, skipping, a moment of one (`seek(fraction)`) and where one is (`state()`).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __stage?: object };
    w.__stage = {
      ...w.__stage,
      gl,
      scene,
      director: {
        get controller() {
          return controller.current;
        },
        get visitorPose() {
          return visitorPose.current;
        },
        get worldHex() {
          return staging.current?.world.hex ?? null;
        },
        get books() {
          return staging.current?.books ?? [];
        },
      },
      hide(wall: number, shelf: number, volume: number) {
        const place = store.getSnapshot().place ?? START;
        setHiddenVolume({ level: place.level, side: place.side, wall, shelf, volume });
      },
      lightDesk(wall: number | null) {
        setDeskLamp(wall === null ? null : { wall, intensity: DESK_LAMP_INTENSITY });
      },
      setTimeScale(scale: number) {
        timeScale.current = scale;
      },
      skip() {
        store.commands.skip?.();
      },
      seek(fraction: number) {
        const f = flight.current;
        if (!f) return;
        f.t = THREE.MathUtils.clamp(fraction, 0, 1) * f.timeline.duration;
        play(f);
      },
      state() {
        const f = flight.current;
        return { controller: controller.current, moving: store.getSnapshot().moving, kind: f?.kind ?? null, t: f?.t ?? 0, duration: f?.timeline.duration ?? 0 };
      },
    };
  }, [gl, scene, store, play]);

  const kind = shown?.controller.kind;
  const placeHex = shown?.placeHex;
  const closeupWall = shown?.closeup?.wall;
  const closeupShelf = shown?.closeup?.shelf;
  // Titles published for another shelf are not this one's: its spines stay blank until their own arrive.
  const titles =
    shelfTitles && shelfTitles.hex === placeHex && shelfTitles.wall === closeupWall && shelfTitles.shelf === closeupShelf ? shelfTitles.titles : NO_TITLES;
  const detail = useMemo<ShelfDetail | null>(
    () => (closeupWall !== undefined && closeupShelf !== undefined ? { wall: closeupWall, shelf: closeupShelf, titles } : null),
    [closeupWall, closeupShelf, titles]
  );
  const shelfSpot = useMemo(
    () => (closeupWall !== undefined && closeupShelf !== undefined ? { wall: closeupWall, shelf: closeupShelf } : null),
    [closeupWall, closeupShelf]
  );

  // A book off its shelf (on a desk or in the air) leaves a gap there and lights the lamp of its desk, in the gallery the visitor is in.
  const level = shown?.place.level ?? START.level;
  const side = shown?.place.side ?? START.side;
  const off = shown?.books.find((b) => b.shown);
  const offWall = off?.book.wall;
  const offShelf = off?.book.shelf;
  const offVolume = off?.book.volume;
  const offDesk = off?.desk;
  const gap = useMemo<HiddenVolume | null>(
    () =>
      offWall !== undefined && offShelf !== undefined && offVolume !== undefined ? { level, side, wall: offWall, shelf: offShelf, volume: offVolume } : null,
    [level, side, offWall, offShelf, offVolume]
  );
  const lamp = useMemo(() => (offDesk !== undefined ? { wall: offDesk, intensity: DESK_LAMP_INTENSITY } : null), [offDesk]);
  // Fixed while the store lives, like `on`: the memoised world must not re-render for it. While a flight plays the world
  // answers nothing: hovers go unreported (leaving still is reported) and clicks do nothing.
  const worldOn = useMemo(() => {
    const still = () => !store.getSnapshot().moving;
    return {
      ...on,
      onHoverBook: (book: BookRef | null) => {
        hovered.current = book;
        if (book === null || still()) on.onHoverBook(book);
      },
      onHoverShelf: (wall: number, shelfNumber: number | null) => {
        if (shelfNumber === null || still()) on.onHoverShelf(wall, shelfNumber);
      },
      onClickShelf: (wall: number, shelfNumber: number) => {
        if (still()) on.onClickShelf(wall, shelfNumber);
      },
      onClickBook: takeOnClick,
    };
  }, [store, on, takeOnClick]);

  if (!shown) return null;
  return (
    <World
      key={`${shown.world.hex}#${shown.world.build}`}
      mount={shown.world}
      controlsRef={attachControls}
      // While a book is off its shelf (on the desk, or flying to or from it) the world answers nothing: it changes along
      // with the gap and the lamp, so a return re-renders the world once, as it lands.
      interactive={moving || off || kind === "desk" ? "none" : kind === "shelf" ? "shelf" : "walk"}
      detail={detail}
      hidden={gap ?? hiddenVolume}
      shelfSpot={shelfSpot}
      deskLamp={lamp ?? deskLamp}
      deskLightRef={deskLight}
      onCurrentCellReady={cellReady}
      on={worldOn}
    >
      <DeskBookWarmUp />
      {shown.books.map((staged) => {
        const key = bookKey(staged.book);
        const link = links.current.get(key);
        // A book of the titled close-up shelf flies with its title gilded on its spine, as it stands there.
        const { wall, shelf, volume } = staged.book;
        const spineTitle = detail && detail.wall === wall && detail.shelf === shelf ? (detail.titles[volume - 1] ?? "") : undefined;
        return link && <Book key={key} staged={staged} place={shown.place} link={link} spineTitle={spineTitle} onReady={bookReady} />;
      })}
    </World>
  );
}

interface WorldProps {
  mount: WorldMount;
  controlsRef: (handle: GalleryControlsHandle | null) => void;
  interactive: "walk" | "shelf" | "none";
  detail: ShelfDetail | null;
  hidden: HiddenVolume | null;
  shelfSpot: { wall: number; shelf: number } | null;
  deskLamp: { wall: number; intensity: number } | null;
  deskLightRef: RefObject<THREE.PointLight | null>;
  onCurrentCellReady: () => void;
  on: Required<StageHandlers>;
  /** Drawn only with the world, and so with its lights: a material first drawn without them keeps an unlit program. */
  children?: ReactNode;
}

/** The world with the materials of its address (the stair and the mirror use them), loading behind its own boundary. */
function World({ mount, controlsRef, interactive, detail, hidden, shelfSpot, deskLamp, deskLightRef, onCurrentCellReady, on, children }: WorldProps) {
  const store = useStageStore();
  const seed = useMemo(() => hashString(mount.hex), [mount.hex]);
  // Unmounting controls let go of the mouse without reporting it: the next world must not find it taken.
  useEffect(() => () => store.patch({ locked: false }), [store]);
  return (
    <Suspense fallback={null}>
      <LibraryMaterialsProvider seed={seed}>
        <GalleryWorld
          worldHex={mount.hex}
          initialPose={mount.pose}
          initialPlace={mount.place}
          controlsRef={controlsRef}
          interactive={interactive}
          detail={detail}
          hidden={hidden}
          shelfSpot={shelfSpot}
          deskLamp={deskLamp}
          deskLightRef={deskLightRef}
          onCurrentCellReady={onCurrentCellReady}
          onHoverBook={on.onHoverBook}
          onClickBook={on.onClickBook}
          onHoverShelf={on.onHoverShelf}
          onClickShelf={on.onClickShelf}
          onFacingSide={on.onFacingSide}
          onPlace={on.onPlace}
          onInteract={on.onInteract}
          onLockChange={on.onLockChange}
        />
        {children}
      </LibraryMaterialsProvider>
    </Suspense>
  );
}

interface BookProps {
  staged: StagedBook;
  place: Place;
  link: BookLink;
  spineTitle: string | undefined;
  onReady: () => void;
}

/** A book on the stage, with the materials of its gallery (its binding, its paper), loading behind its own boundary. */
function Book({ staged, place, link, spineTitle, onReady }: BookProps) {
  const { book, mode, shown } = staged;
  const view = useStageSelector((s) => s.view);
  const desk = useStageSelector((s) => s.desk);
  const moving = useStageSelector((s) => s.moving);
  const seed = useMemo(() => hashString(book.hex), [book.hex]);
  const frame = useMemo(() => deskFrame(place.level, place.side, staged.desk), [place.level, place.side, staged.desk]);
  // The inputs in the store are this book's own while its page is the one on show (a page publishes its view before its
  // inputs), unless a click took the book with them in the store. A book leaving the stage keeps the last of its own
  // (a swap's departing book closes on its own pages); one whose page has published nothing yet shows its index.
  const own = view?.kind === "desk" && sameBook(view.book, book) && desk !== null && desk !== link.stale ? desk : null;
  const [kept, setKept] = useState(own);
  if (own && own !== kept) setKept(own);
  const inputs = own ?? kept ?? INDEX_INPUTS;
  return (
    <Suspense fallback={null}>
      <LibraryMaterialsProvider seed={seed}>
        <group visible={shown}>
          <DeskBook
            book={book}
            frame={frame}
            mode={mode}
            inputs={inputs}
            controlsEnabled={!moving}
            interactive={!moving}
            motion={link.motion}
            orbitRef={link.orbit}
            spineTitle={spineTitle}
            shown={shown}
          />
        </group>
        <Mounted onMounted={onReady} />
      </LibraryMaterialsProvider>
    </Suspense>
  );
}

/** Tells the director that what it keeps the veil up for has mounted. */
function Mounted({ onMounted }: { onMounted: () => void }) {
  useEffect(() => {
    onMounted();
  }, [onMounted]);
  return null;
}
