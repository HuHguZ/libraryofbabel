"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useTranslations } from "next-intl";
import { hashString } from "@/lib/hex";
import { LIBRARY } from "@/lib/library";
import { makeTitleGilt } from "../Bookcase";
import { planBookcase } from "../bookcasePlan";
import {
  INDEX,
  INDEX_CANVAS,
  PAGE,
  TEXT_BATCH,
  TEXT_BATCH_STILL,
  indexCellCenter,
  indexCellFromUv,
  makeBlankPage,
  makeIndexPage,
  makeTextPage,
  makeTitlePage,
  pagesAround,
  pagesToDraw,
} from "../bookPages";
import { setCanvasCursor } from "../cursor";
import { TURN, TURN_RIFFLE, arrangeLeaves, createLeaves, stepLeaves } from "../leaves";
import { useLibraryMaterials } from "../materials";
import { loadSerifFont } from "../textTexture";
import { Bookmark, bendSheet, glideKey, makeSheet, pageGeometry, useTitlePageText, type GlideKey } from "./bookParts";
import {
  COVER,
  COVER_TOP,
  FLIP_LIFT,
  GUTTER,
  HOME_POSITION,
  HOME_TARGET,
  MAX_DISTANCE,
  MIN_DISTANCE,
  OVERVIEW_DISTANCE,
  PAGE_LIFT,
  RIBBON_LIFT,
  SPINE,
  VIEW_BOUNDS,
  blockHeights,
} from "./bookSpace";
import { bookDirToWorld, bookMatrix, bookToWorld, deskBookPose, worldToBook, type DeskFrame } from "./deskFrame";
import type { BookPose } from "./poses";
import { useStageStore } from "./StageProvider";
import type { BookAddress, DeskInputs } from "./stageStore";
import { nextDryingStep, nextIndexFace, nextRiffling } from "./turnState";

export interface DeskBookProps {
  book: BookAddress;
  /** The desk the book lies on: where its book space is in the world. */
  frame: DeskFrame;
  /** "index": the right page of the first spread is the index of pages; "read": the book is read page by page. */
  mode: "index" | "read";
  /** What the volume or the reader page feeds the book. */
  inputs: DeskInputs;
  /** The reader's orbit, key glides and camera glides drive the camera (off while something else does). */
  controlsEnabled: boolean;
  /** The pages answer the pointer. */
  interactive: boolean;
  /** Where a flight has the book, written by the director and read every frame (a flight renders nothing); lying open on its desk when omitted. */
  motion?: BookMotion;
  /** Given the reader's orbit, so the director knows where it looks when a flight leaves the desk and aims it where one lands. */
  orbitRef?: RefObject<BookOrbit | null>;
  /** The title gilded on the spine, as the shelf close-up shows it (a blank one names the volume); a plain spine when omitted. */
  spineTitle?: string;
  /** Drawn (rather than a swap's other book, waiting unseen): only this one's orbit should register itself as `state.controls`. */
  shown?: boolean;
}

/** A book in flight: the pose of the closed book's centre (null: lying on its desk) and how far its covers are open, 0 closed to 1 lying open. */
export interface BookMotion {
  pose: BookPose | null;
  openness: number;
}

export type BookOrbit = ComponentRef<typeof OrbitControls>;
type Controls = BookOrbit;

/** Leaf k carries page 2k + 1 on its front and page 2k + 2 on its back (see leaves.ts). */
const LEAVES = Math.floor(LIBRARY.pages / 2);
/** Sheets in the air at most: as many as a riffle lifts, which is more than ordinary turning does. */
const SHEETS = Math.max(TURN.sheets, TURN_RIFFLE.sheets);
/** A jump to a spread further than this riffles through the pages (TURN_RIFFLE) until they settle. */
const RIFFLE_FROM = 12;
const CLICK_SLOP = 5;
/** Page textures kept drawn and uploaded; the shown spread and its neighbours are always among them. */
const CACHE_LIMIT = 12;
/**
 * How long a freshly written page is left to dry, milliseconds. A browser rasterises a page of text in its own
 * time; reading the canvas back before it has (uploading it, say) makes the thread wait for the whole page —
 * tens of milliseconds where a frame is sixteen. A page kept in main memory (`createCanvas`) is ready at once,
 * but that is only a hint a browser may ignore, and a page is always drawn ahead of when it is wanted anyway.
 */
const PAGE_DRYING = 18;
/** How far the view may swing round the book either way from straight across it, radians. */
const AZIMUTH = 0.95;
/** The highlight over a number of the index floats this far over the page. */
const HIGHLIGHT_LIFT = 0.002;
/** Away from the reader, across the book. */
const BOOK_FORWARD = new THREE.Vector3(0, 0, -1);
/** Height of the middle of the spine over the gutter while the book lies open. */
const SPINE_Y = COVER_TOP + 0.06;
/** How thick the spine is along the back of the closed book: it stands a little out of the covers' edges. */
const SPINE_BACK = 0.025;
/**
 * The spine turned half round about y: its underside, which becomes the back of the closed book, then carries the
 * spine's leather and gilt head up and across, as the front of a volume on its shelf does.
 */
const SPINE_GEOMETRY = new THREE.BoxGeometry(SPINE.w, SPINE.h, SPINE.d).rotateY(Math.PI);
/** The orbit is switched on or off after the director has moved the book (-2) and before drei updates the orbit (-1). */
const ORBIT_GATE_PRIORITY = -1.5;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const NO_RAYCAST = () => null;

interface PageTex {
  key: string;
  texture: THREE.CanvasTexture;
  first: { x: number; y: number } | null;
  /** Where the current occurrence of the phrase is on this page, if it is here. */
  current: { x: number; y: number } | null;
  /** Centre of the marked fragment on this page, if it has one. */
  mark: { x: number; y: number } | null;
}

/**
 * The volume open on a reading desk, at the size of a volume on its shelf: its leaves, turning sheets and page
 * textures, the reader's camera over it (orbit, key glides, glides to a phrase or a fragment), and in index mode
 * the index of pages on the right page of the first spread. Everything is laid out in the reader's book space;
 * one group puts the book into the world (on its desk, or wherever a flight has it, its covers hinged shut), and the
 * camera logic converts between the two through `frame`.
 */
export default function DeskBook({ book, frame, mode, inputs, controlsEnabled, interactive, motion, orbitRef, spineTitle, shown: isShown = true }: DeskBookProps) {
  const { title, spread, contents, query, focusToken, currentMatch, matchStep, mark, markColor, markFocusToken } = inputs;
  const store = useStageStore();
  const titleText = useTitlePageText(title, book.wall, book.shelf, book.volume);
  const bookText = useTranslations("Book");
  const commonText = useTranslations("Common");
  const indexText = useMemo(
    () => ({ title: bookText("indexTitle"), subtitle: bookText("indexSubtitle", { pages: LIBRARY.pages, chars: LIBRARY.pageLength }) }),
    [bookText]
  );
  const materials = useLibraryMaterials();
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const [family, setFamily] = useState<string | null>(null);
  const ownOrbit = useRef<Controls>(null);
  const controlsRef = orbitRef ?? ownOrbit;
  const bookRef = useRef<THREE.Group>(null);

  // What the render loop and the pointer handlers read: the latest props, never a memoised closure's.
  const restPose = useMemo(() => deskBookPose(frame), [frame]);
  const live = useRef({ mode, controlsEnabled, interactive, motion, frame, restPose });
  useLayoutEffect(() => {
    live.current = { mode, controlsEnabled, interactive, motion, frame, restPose };
  });
  /** Lying open on its desk: only then do the orbit, the keys and the pages answer. */
  const atRest = () => {
    const m = live.current.motion;
    return !m || (m.pose === null && m.openness >= 1);
  };
  const answers = () => live.current.interactive && atRest();

  // The binding of the volume on its shelf: the book in the air and on the desk is the one taken from there.
  const tint = useMemo(() => {
    const placement = planBookcase(hashString(book.hex), book.wall).placements.find((p) => p.shelf === book.shelf && p.volume === book.volume);
    return placement?.tint ?? 0;
  }, [book.hex, book.wall, book.shelf, book.volume]);

  /* ── Turning: the requested spread, and the leaves that move towards it ── */
  const [leaves] = useState(() => createLeaves(LEAVES, spread));
  const target = useRef(spread);
  const heading = useRef<1 | -1>(1);
  useLayoutEffect(() => {
    if (spread !== target.current) heading.current = spread > target.current ? 1 : -1;
    target.current = spread;
  }, [spread]);
  /** The open spread as last arranged: pages from 2 × left to 2 × right + 1, sheets in the air between. */
  const lying = useRef({ left: spread, right: spread });
  /** A long jump riffles through the pages until they settle, then turning is ordinary again. */
  const riffling = useRef(false);
  /** Page 1 shows the index: in index mode, and on the leaf that carries it away from the index until that leaf has landed. */
  const indexFace = useRef(mode === "index");

  useEffect(() => {
    let alive = true;
    loadSerifFont().then((f) => {
      if (alive) setFamily(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* ── Page textures: one page is drawn ahead at a time, a few lines to a frame, so no frame carries a whole one ── */
  const blank = useMemo(() => makeBlankPage(materials.textures.parchment), [materials]);
  useEffect(() => () => blank.dispose(), [blank]);

  const drawn = useRef({ family, contents, query, currentMatch, mark, markColor, title, titleText, indexText, parchment: materials.textures.parchment });
  useLayoutEffect(() => {
    drawn.current = { family, contents, query, currentMatch, mark, markColor, title, titleText, indexText, parchment: materials.textures.parchment };
  });

  const cache = useRef(new Map<number, PageTex>());
  const index = useRef<{ key: string; texture: THREE.CanvasTexture } | null>(null);
  /**
   * What is being drawn — a page, or the index of pages (`page` null). Its text is written a few lines to a
   * frame (`writing`), then it is left to dry, and only then does it join the cache and the book.
   */
  const drying = useRef<{ page: number | null; tex: PageTex; at: number; writing: ((lines: number) => boolean) | null } | null>(null);
  useEffect(() => {
    const all = cache.current;
    const drawnIndex = index;
    const wet = drying;
    return () => {
      for (const tex of all.values()) tex.texture.dispose();
      all.clear();
      drawnIndex.current?.texture.dispose();
      drawnIndex.current = null;
      wet.current?.tex.texture.dispose();
      wet.current = null;
    };
  }, []);

  /** What a page looks like right now, or null while it cannot be drawn yet (no font or no text). */
  const pageKey = (page: number): string | null => {
    const { family: f, contents: c, query: q, currentMatch: cm, mark: m, markColor: mc, title: tl, titleText: tt } = drawn.current;
    if (!f || page < 0 || page > LIBRARY.pages) return null;
    if (page === 0) return `title|${tl}|${tt.library}|${tt.untitled}|${tt.volume}|${tt.location}|${tt.epigraph}`;
    if (c[page] === undefined) return null;
    // Only the pages carrying the mark or the current occurrence are redrawn when those move.
    return `${q}|${tl}|${tt.untitled}|${m?.page === page ? `${m.start}-${m.end}-${mc}` : ""}|${cm?.page === page ? cm.start : ""}`;
  };

  /**
   * Uploads a page the browser has had time to draw, then lets go of its canvas. Asking for a canvas in the
   * frame its drawing was queued in makes the thread wait for the whole page to be rasterised (tens of
   * milliseconds, and the turn stops dead); a moment later the picture is ready and the upload is free.
   */
  const upload = (texture: THREE.CanvasTexture) => {
    gl.initTexture(texture);
    const canvas = texture.image as HTMLCanvasElement;
    canvas.width = 1;
    canvas.height = 1;
  };

  /** Starts a page on its own canvas: the paper, its head and highlights. `carryOn` writes its text and takes it in. */
  const drawPage = (page: number, key: string): void => {
    const { family: f, contents: c, query: q, currentMatch: cm, mark: m, markColor: mc, title: tl, titleText: tt, parchment } = drawn.current;
    const started: { tex: PageTex; writing: ((lines: number) => boolean) | null } =
      page === 0
        ? { tex: { key, texture: makeTitlePage(f!, parchment, tt), first: null, current: null, mark: null }, writing: null }
        : (() => {
            const r = makeTextPage(f!, parchment, {
              content: c[page],
              page,
              title: tl,
              untitled: tt.untitled,
              side: page % 2 === 0 ? "left" : "right",
              query: q,
              mark: m?.page === page ? m : null,
              markColor: mc,
              current: cm?.page === page ? cm.start : null,
            });
            return { tex: { key, texture: r.texture, first: r.firstMatch, current: r.currentMatch, mark: r.markCenter }, writing: r.writeLines };
          })();
    // Always starts from an empty slot: this only ever runs where `busy` (drying.current !== null) was false.
    drying.current = { page, tex: started.tex, at: performance.now(), writing: started.writing };
  };

  /**
   * Writes the next lines of the page being drawn, or takes it in once the browser has had `PAGE_DRYING`.
   *
   * It runs before the pages are handed their pictures, so the texture it replaces is never freed while a
   * material still points at it. A page written while the book lies still is written in far bigger pieces:
   * nothing is waiting on the frames, and the page is wanted whole and at once.
   */
  const carryOn = (now: number, still: boolean): void => {
    const wet = drying.current!;
    const wanted = wet.page === null ? indexKey() : pageKey(wet.page);
    const step = nextDryingStep({ stale: wanted !== wet.tex.key, writing: wet.writing !== null, since: now - wet.at }, PAGE_DRYING);
    if (step === "wait") return;
    if (step === "write") {
      if (!wet.writing!(still ? TEXT_BATCH_STILL : TEXT_BATCH)) {
        wet.writing = null;
        wet.at = now;
      }
      return;
    }
    drying.current = null;
    if (step === "drop") {
      wet.tex.texture.dispose();
      return;
    }
    upload(wet.tex.texture);
    if (wet.page === null) {
      index.current?.texture.dispose();
      index.current = { key: wet.tex.key, texture: wet.tex.texture };
      return;
    }
    cache.current.get(wet.page)?.texture.dispose();
    cache.current.set(wet.page, wet.tex);
  };

  const indexKey = () => `${drawn.current.indexText.title}|${drawn.current.indexText.subtitle}`;
  /** Starts the index of pages, which is drawn whole; once in, it stays for the life of the book. */
  const drawIndex = (key: string): void => {
    const { family: f, indexText: it, parchment } = drawn.current;
    if (!f) return;
    // Always starts from an empty slot too: see drawPage.
    drying.current = { page: null, tex: { key, texture: makeIndexPage(f, parchment, it), first: null, current: null, mark: null }, at: performance.now(), writing: null };
  };

  /* ── Materials and geometry ── */
  const paper = useMemo(() => {
    const make = () => new THREE.MeshStandardMaterial({ map: blank, color: new THREE.Color("#f2e8d2"), roughness: 0.9 });
    return { left: make(), right: make() };
  }, [blank]);
  useEffect(() => () => Object.values(paper).forEach((m) => m.dispose()), [paper]);

  const sheets = useMemo(() => Array.from({ length: SHEETS }, () => makeSheet(blank)), [blank]);
  useEffect(
    () => () => {
      for (const s of sheets) {
        s.surface.dispose();
        s.reverse.dispose();
        s.front.dispose();
        s.back.dispose();
      }
    },
    [sheets]
  );
  const flatPage = useMemo(() => pageGeometry(), []);
  useEffect(() => () => flatPage.dispose(), [flatPage]);

  const leftPlane = useRef<THREE.Mesh>(null);
  const rightPlane = useRef<THREE.Mesh>(null);
  const leftBlock = useRef<THREE.Mesh>(null);
  const rightBlock = useRef<THREE.Mesh>(null);
  const bookmark = useRef<THREE.Group>(null);
  const highlight = useRef<THREE.Mesh>(null);
  const frontHinge = useRef<THREE.Group>(null);
  const frontHalf = useRef<THREE.Group>(null);
  const spineHinge = useRef<THREE.Group>(null);
  const spine = useRef<THREE.Mesh>(null);

  /* ── The book in the world: its pose, or lying on its desk; its covers, open or closed ── */
  const placed = useRef(new THREE.Matrix4());
  const placeBook = (heights: { left: number; right: number }) => {
    const group = bookRef.current;
    if (!group) return;
    const { motion: m, restPose: rest } = live.current;
    bookMatrix(m?.pose ?? rest, placed.current);
    if (!group.matrix.equals(placed.current)) {
      group.matrix.copy(placed.current);
      group.matrixWorldNeedsUpdate = true;
    }
    // The front half (cover, block, page, ribbon) turns over the spine onto the back half; the spine turns half as far.
    const openness = m ? THREE.MathUtils.clamp(m.openness, 0, 1) : 1;
    const angle = -Math.PI * (1 - openness);
    // heights.left + heights.right is always 0.135 (blockHeights keeps their sum constant as pages turn), so the
    // hinge in fact sits at a fixed height; taking it from the caller's heights avoids a second, special-cased sum.
    const hinge = COVER_TOP + (heights.left + heights.right) / 2;
    if (frontHinge.current && frontHalf.current) {
      frontHinge.current.position.y = hinge;
      frontHinge.current.rotation.z = angle;
      frontHalf.current.position.y = -hinge;
    }
    if (spineHinge.current && spine.current) {
      spineHinge.current.position.y = hinge;
      spineHinge.current.rotation.z = angle / 2;
      spine.current.position.y = SPINE_Y - hinge;
      // Over the gutter it is a ridge; along the back of the closed book it spans both covers and the blocks between them.
      spine.current.scale.set(
        THREE.MathUtils.lerp((2 * hinge) / SPINE.w, 1, openness),
        THREE.MathUtils.lerp(SPINE_BACK / SPINE.h, 1, openness),
        1
      );
    }
  };
  // Placed before the first frame too: nothing may ever see the book at the origin of the world, or open on a shelf.
  useLayoutEffect(() => placeBook(blockHeights(lying.current.left)));

  /* ── Camera glides: to the current occurrence of the phrase, or back over the whole book (world units) ── */
  const focus = useRef<{ target: THREE.Vector3; position: THREE.Vector3; active: boolean }>({
    target: new THREE.Vector3(),
    position: new THREE.Vector3(),
    active: false,
  });
  const lastFocus = useRef<string | undefined>(undefined);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (focusToken && focusToken !== lastFocus.current && query) pendingFocus.current = focusToken;
  }, [focusToken, query]);

  const pendingMark = useRef<string | null>(null);
  useEffect(() => {
    if (markFocusToken) pendingMark.current = markFocusToken;
  }, [markFocusToken]);
  // The spread where the camera last glided to the mark. A search glide that settles a frame later
  // (a shared link carrying both) does not take the view away from it, until the phrase or the spread changes.
  const markGlided = useRef<number | null>(null);
  useEffect(() => {
    markGlided.current = null;
  }, [query]);

  const glideHome = () => {
    const f = live.current.frame;
    bookToWorld(f, HOME_TARGET, focus.current.target);
    bookToWorld(f, HOME_POSITION, focus.current.position);
    focus.current.active = true;
  };

  // Stepping to another occurrence is the reader's own request: it may take the view away from a shared fragment.
  useEffect(() => {
    if (matchStep) markGlided.current = null;
  }, [matchStep]);

  /** Glides over a spot of an open page, given as fractions of the page, with the page blocks this high. */
  const spot = useRef(new THREE.Vector3());
  const glideToSpot = (page: number, at: { x: number; y: number }, heights: { left: number; right: number }) => {
    const isLeft = page % 2 === 0;
    const x = isLeft ? -GUTTER - PAGE.w + at.x * PAGE.w : GUTTER + at.x * PAGE.w;
    const y = COVER_TOP + (isLeft ? heights.left : heights.right);
    const z = -PAGE.d / 2 + at.y * PAGE.d;
    const f = live.current.frame;
    bookToWorld(f, spot.current.set(x, y, z), focus.current.target);
    bookToWorld(f, spot.current.set(x, y + 0.78, z + 0.5), focus.current.position);
    focus.current.active = true;
  };

  // Clearing the phrase brings the camera back over the whole book.
  const lastQuery = useRef(query);
  useEffect(() => {
    const had = lastQuery.current;
    lastQuery.current = query;
    if (!had || query) return;
    glideHome();
    lastFocus.current = undefined;
    pendingFocus.current = null;
  }, [query]);

  /* ── Keys: WASD glide over the pages, ↑ ↓ closer and farther, Shift speeds up, Home shows the whole book ── */
  const held = useRef(new Set<GlideKey>());
  useEffect(() => {
    const keys = held.current;
    const typing = (e: KeyboardEvent) => {
      const el = e.target;
      return el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onDown = (e: KeyboardEvent) => {
      if (!live.current.controlsEnabled || !atRest() || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Home" || e.key === "Home") {
        e.preventDefault();
        glideHome();
        store.handlers.current.onInteract?.();
        return;
      }
      const key = glideKey(e);
      if (!key) return;
      if (key !== "fast") {
        e.preventDefault();
        focus.current.active = false;
        store.handlers.current.onInteract?.();
      }
      keys.add(key);
    };
    const onUp = (e: KeyboardEvent) => {
      const key = glideKey(e);
      if (key) keys.delete(key);
      if (e.key === "Shift") keys.delete("fast");
    };
    const release = () => keys.clear();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
      keys.clear();
    };
  }, [store]);

  /* ── Pointer: the pages turn in read mode; in index mode the right page is the index ── */
  const hover = useRef<"prev" | "next" | null>(null);
  const setHover = (which: "prev" | "next" | null) => {
    if (hover.current === which) return;
    hover.current = which;
    setCanvasCursor(gl.domElement, which !== null);
    store.handlers.current.onHoverTurn?.(which);
  };

  const hoveredCell = useRef<number | null>(null);
  const setHoveredCell = (cell: number | null) => {
    if (hoveredCell.current === cell) return;
    hoveredCell.current = cell;
    const h = highlight.current;
    if (h) {
      h.visible = cell !== null;
      if (cell !== null) {
        const c = indexCellCenter(cell);
        h.position.set(-PAGE.w / 2 + c.x * PAGE.w, HIGHLIGHT_LIFT, -PAGE.d / 2 + c.y * PAGE.d);
      }
    }
    setCanvasCursor(gl.domElement, cell !== null);
    store.handlers.current.onHoverIndexPage?.(cell === null ? null : cell + 1);
  };
  useEffect(() => () => setCanvasCursor(gl.domElement, false), [gl]);

  /** The index lies open and still: its numbers can be chosen. */
  const atIndex = () => live.current.mode === "index" && target.current === 0 && lying.current.left === 0 && lying.current.right === 0;
  /** Which mode the hovers were made in: a hover left over from the other mode is let go. */
  const hoverMode = useRef(mode);

  // Development aid: the console can watch the leaves, the page textures and the view, and slow the turns down (window.__reader).
  // It is the book the reader has: published again whenever a book's controls come on, as it lands on the desk.
  const timeScale = useRef(1);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !controlsEnabled) return;
    const w = window as unknown as { __reader?: unknown };
    const reader = {
      leaves,
      cache: cache.current,
      controls: controlsRef,
      camera,
      arrange: () => arrangeLeaves(leaves),
      setTimeScale: (scale: number) => (timeScale.current = scale),
      // The desk's book space, and a world point (the controls' target, say) in it.
      frame,
      toBook: (p: THREE.Vector3Like) => worldToBook(frame, p),
    };
    w.__reader = reader;
    // Unmounting (or losing the controls) drops the book's own leaves and page-texture cache from the
    // window, unless a book that has since taken over the hook would be wiped instead.
    return () => {
      if (w.__reader === reader) delete w.__reader;
    };
  }, [leaves, camera, frame, controlsRef, controlsEnabled]);

  const glide = useRef(new THREE.Vector3());
  const zoomRate = useRef(0);
  const scratch = useRef({
    forward: new THREE.Vector3(),
    side: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    move: new THREE.Vector3(),
    moved: new THREE.Vector3(),
    now: new THREE.Vector3(),
    goal: new THREE.Vector3(),
  });

  // The orbit only ever moves the camera of a book lying open on its desk: in flight the director has the camera.
  useFrame(() => {
    const controls = controlsRef.current;
    if (controls) controls.enabled = live.current.controlsEnabled && atRest();
  }, ORBIT_GATE_PRIORITY);

  useFrame((state, dt) => {
    const step = Math.min(dt, 0.05);
    const { mode: m, controlsEnabled: enabled, frame: f, motion: flight } = live.current;
    const rest = atRest();
    const openness = flight ? flight.openness : 1;

    /* Turning: a long jump riffles through the pages, and page 1 is the index while the book comes from it. */
    const goal = target.current;
    riffling.current = nextRiffling(riffling.current, lying.current, goal, RIFFLE_FROM);
    stepLeaves(leaves, goal, step * timeScale.current, riffling.current ? TURN_RIFFLE : TURN);
    const arranged = arrangeLeaves(leaves);
    lying.current = { left: arranged.left, right: arranged.right };
    indexFace.current = nextIndexFace(indexFace.current, m, leaves.p[0], leaves.v[0], goal);
    const { left: hl, right: hr } = blockHeights(arranged.turned);
    placeBook({ left: hl, right: hr });

    if (hoverMode.current !== m) {
      hoverMode.current = m;
      setHover(null);
      setHoveredCell(null);
    }
    if (hoveredCell.current !== null && (!atIndex() || !live.current.interactive || !rest)) setHoveredCell(null);
    if (hover.current !== null && (!live.current.interactive || !rest)) setHover(null);

    /* Textures: one page is drawn at a time, a few lines to a frame, and taken in once the browser has drawn it.
       Taking it in comes first, so the page it replaces is handed out to nobody after it is freed. */
    const all = cache.current;
    /** The book lies open and still where it was asked to: only then are the pages around it drawn (`pagesToDraw`). */
    const still = rest && arranged.left === arranged.right && arranged.left === goal;
    const busy = drying.current !== null;
    if (busy) carryOn(performance.now(), still);

    /** Pages on show whose picture is not there yet: they are drawn in their turn, and show blank until they are. */
    const missing: number[] = [];
    const textureOf = (page: number): THREE.Texture => {
      if (page === 1 && indexFace.current) return index.current?.key === indexKey() ? index.current.texture : blank;
      const key = pageKey(page);
      const cached = all.get(page);
      // The text of a book never changes: a page whose text the inputs no longer carry (back at the index) keeps it.
      if (!key) return cached?.texture ?? blank;
      if (cached && cached.key === key) return cached.texture;
      missing.push(page);
      return cached?.texture ?? blank;
    };
    const shown = [2 * arranged.left, 2 * arranged.right + 1];
    paper.left.map = textureOf(shown[0]);
    paper.right.map = textureOf(shown[1]);

    // The sheets in the air belong to a book lying open: a closing or closed one has none.
    const open = openness >= 1;
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];
      const s = arranged.sheets[i];
      sheet.group.visible = !!s && open;
      if (!s || !open) continue;
      shown.push(2 * s.from + 1, 2 * s.to + 2);
      sheet.front.map = textureOf(2 * s.from + 1);
      sheet.back.map = textureOf(2 * s.to + 2);
      bendSheet(sheet, s.p, s.bend, s.seed, state.clock.elapsedTime, COVER_TOP + THREE.MathUtils.lerp(hr, hl, s.p) + FLIP_LIFT);
    }

    // One page is started per frame, and only while nothing else is being drawn.
    if (!busy) {
      const wanted = pagesToDraw(goal, heading.current, missing, still);
      const page = wanted.find((p) => !(p === 1 && indexFace.current) && pageKey(p) !== null && all.get(p)?.key !== pageKey(p));
      if (page !== undefined) drawPage(page, pageKey(page)!);
      // The index is drawn ahead as well, so going back to it never waits for it.
      else if (index.current?.key !== indexKey()) drawIndex(indexKey());
    }
    if (all.size > CACHE_LIMIT) {
      const keep = new Set([...shown, ...pagesAround(goal, heading.current)]);
      const spare = [...all.keys()].filter((page) => !keep.has(page)).sort((a, b) => Math.abs(b - 2 * goal) - Math.abs(a - 2 * goal));
      for (const page of spare) {
        if (all.size <= CACHE_LIMIT) break;
        all.get(page)!.texture.dispose();
        all.delete(page);
      }
    }

    /* The page blocks grow and shrink as the book is read. */
    if (leftBlock.current) {
      leftBlock.current.scale.y = hl / 0.1;
      leftBlock.current.position.y = COVER_TOP + hl / 2;
    }
    if (rightBlock.current) {
      rightBlock.current.scale.y = hr / 0.1;
      rightBlock.current.position.y = COVER_TOP + hr / 2;
    }
    if (leftPlane.current) leftPlane.current.position.y = COVER_TOP + hl + PAGE_LIFT;
    if (rightPlane.current) rightPlane.current.position.y = COVER_TOP + hr + PAGE_LIFT;
    if (bookmark.current) bookmark.current.position.y = COVER_TOP + hl + RIBBON_LIFT;

    /* Once the book lies open at the requested spread, glide to the current occurrence of the phrase on it (the first by default). */
    const token = pendingFocus.current;
    if (token && arranged.left === goal && arranged.right === goal) {
      const hits = [2 * goal, 2 * goal + 1].map((page) => {
        if (page > LIBRARY.pages) return { page, ready: true, at: null };
        const tex = all.get(page);
        const ready = page === 0 || (!!tex && tex.key === pageKey(page));
        const cm = drawn.current.currentMatch;
        return { page, ready, at: ready && tex ? (cm ? (cm.page === page ? tex.current : null) : tex.first) : null };
      });
      if (hits.every((h) => h.ready)) {
        pendingFocus.current = null;
        lastFocus.current = token;
        const hit = hits.find((h) => h.at);
        if (hit?.at && markGlided.current !== goal) glideToSpot(hit.page, hit.at, { left: hl, right: hr });
      }
    }
    if (markGlided.current !== null && markGlided.current !== goal) markGlided.current = null;

    /* Likewise to the marked fragment, once both pages are drawn (so a search glide on the same spread cannot follow and win). */
    const markToken = pendingMark.current;
    if (markToken && arranged.left === goal && arranged.right === goal) {
      const mk = drawn.current.mark;
      const pages = [2 * goal, 2 * goal + 1];
      if (!mk || !pages.includes(mk.page)) {
        pendingMark.current = null;
      } else if (pages.every((page) => page === 0 || page > LIBRARY.pages || (!!all.get(page) && all.get(page)!.key === pageKey(page)))) {
        pendingMark.current = null;
        const at = all.get(mk.page)?.mark;
        if (at) {
          glideToSpot(mk.page, at, { left: hl, right: hr });
          markGlided.current = goal;
        }
      }
    }

    /* The camera is the reader's only while the controls are and the book lies open: otherwise something else drives it. */
    const controls = controlsRef.current;
    if (!controls || !enabled || !rest) {
      held.current.clear();
      glide.current.set(0, 0, 0);
      zoomRate.current = 0;
      return;
    }
    const cam = state.camera;
    const scale = f.scale;
    const fc = focus.current;
    if (fc.active) {
      controls.target.x = THREE.MathUtils.damp(controls.target.x, fc.target.x, 5, step);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, fc.target.y, 5, step);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, fc.target.z, 5, step);
      cam.position.x = THREE.MathUtils.damp(cam.position.x, fc.position.x, 5, step);
      cam.position.y = THREE.MathUtils.damp(cam.position.y, fc.position.y, 5, step);
      cam.position.z = THREE.MathUtils.damp(cam.position.z, fc.position.z, 5, step);
      if (cam.position.distanceTo(fc.position) < 0.01 * scale) fc.active = false;
    }

    /* Keys glide the view across the book, slower the closer the eye is to the page (world units: speeds follow distances). */
    const { forward, side, offset, move, moved, now, goal: aim } = scratch.current;
    const keys = held.current;
    const fast = keys.has("fast") ? 2.5 : 1;
    offset.subVectors(cam.position, controls.target);
    const zoom = (keys.has("farther") ? 1 : 0) - (keys.has("closer") ? 1 : 0);
    zoomRate.current = THREE.MathUtils.damp(zoomRate.current, zoom * 1.1 * fast, 10, step);
    if (Math.abs(zoomRate.current) > 1e-4) {
      const length = offset.length();
      const next = THREE.MathUtils.clamp(length * Math.exp(zoomRate.current * step), MIN_DISTANCE * scale, MAX_DISTANCE * scale);
      offset.multiplyScalar(next / length);
      cam.position.copy(controls.target).add(offset);
    }
    const distance = offset.length();
    forward.set(-offset.x, 0, -offset.z);
    if (forward.lengthSq() < 1e-6 * scale * scale) bookDirToWorld(f, BOOK_FORWARD, forward);
    forward.normalize();
    side.set(-forward.z, 0, forward.x);
    const speed = distance * 0.85 * fast;
    move
      .set(0, 0, 0)
      .addScaledVector(forward, (keys.has("up") ? 1 : 0) - (keys.has("down") ? 1 : 0))
      .addScaledVector(side, (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0));
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    glide.current.lerp(move, 1 - Math.exp(-10 * step));
    move.copy(glide.current).multiplyScalar(step);

    // In book space: zoomed far out the view drifts back over the whole book, and the point looked at stays over the book.
    const drift = THREE.MathUtils.smoothstep(distance / scale, OVERVIEW_DISTANCE.from, OVERVIEW_DISTANCE.to) * (1 - Math.exp(-2.5 * step));
    worldToBook(f, controls.target, now);
    worldToBook(f, moved.addVectors(controls.target, move), aim);
    aim.x = THREE.MathUtils.clamp(aim.x + (HOME_TARGET.x - now.x) * drift, -VIEW_BOUNDS.x, VIEW_BOUNDS.x);
    aim.z = THREE.MathUtils.clamp(aim.z + (HOME_TARGET.z - now.z) * drift, -VIEW_BOUNDS.z, VIEW_BOUNDS.z);
    aim.y = THREE.MathUtils.clamp(now.y, VIEW_BOUNDS.yMin, VIEW_BOUNDS.yMax);
    move.subVectors(bookToWorld(f, aim, moved), controls.target);
    if (move.lengthSq() > 1e-14) {
      controls.target.add(move);
      cam.position.add(move);
    }
  });

  const cover = materials.books[tint].cover;
  // A book flying from or to the shelf close-up carries its title on the spine, as the titled volumes there do.
  const titledSpine = useMemo(() => {
    if (spineTitle === undefined || !family) return null;
    const gilt = makeTitleGilt(spineTitle.trim() || commonText("volumeN", { n: book.volume }), family);
    const material = materials.books[tint].spine.clone();
    material.emissiveMap = gilt;
    material.emissiveIntensity = 0.65;
    material.needsUpdate = true;
    return { material, gilt };
  }, [spineTitle, family, commonText, book.volume, materials, tint]);
  useEffect(
    () => () => {
      titledSpine?.material.dispose();
      titledSpine?.gilt.dispose();
    },
    [titledSpine]
  );
  // The spine's underside, the back of the closed book, is leather and gilt like the front of a volume on its shelf.
  const spineMaterials = useMemo(() => {
    const binding = materials.books[tint];
    return [binding.cover, binding.cover, binding.cover, titledSpine?.material ?? binding.spine, binding.cover, binding.cover];
  }, [materials, tint, titledSpine]);
  const h0 = blockHeights(spread);
  const hinge0 = COVER_TOP + (h0.left + h0.right) / 2;
  const homeTarget = useMemo(() => bookToWorld(frame, HOME_TARGET).toArray(), [frame]);

  /** A click that ends a drag across the page moved the view; it does not turn the page or choose a number. */
  const turn = (e: ThreeEvent<MouseEvent>, direction: 1 | -1) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP || !answers()) return;
    if (live.current.mode === "read") store.handlers.current.onTurn?.(direction);
  };

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault={isShown}
        enabled={controlsEnabled}
        target={homeTarget}
        minDistance={MIN_DISTANCE * frame.scale}
        maxDistance={MAX_DISTANCE * frame.scale}
        minPolarAngle={0.05}
        maxPolarAngle={1.25}
        // Book +z (the reader's side) lies at azimuth `frame.yaw` in the world.
        minAzimuthAngle={wrapAngle(frame.yaw - AZIMUTH)}
        maxAzimuthAngle={wrapAngle(frame.yaw + AZIMUTH)}
        // Like a map: drag moves over the pages, right drag (or Shift + drag) tilts, the wheel flies to the cursor.
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
        screenSpacePanning={false}
        zoomToCursor
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.6}
        panSpeed={1}
        zoomSpeed={0.9}
        onStart={() => {
          focus.current.active = false;
          store.handlers.current.onInteract?.();
        }}
      />

      <group ref={bookRef} matrixAutoUpdate={false}>
        {/* The back half of the cover, under the right page block */}
        <mesh position={[COVER.w / 4, COVER_TOP / 2, 0]} material={cover}>
          <boxGeometry args={[COVER.w / 2, COVER_TOP, COVER.d]} />
        </mesh>

        {/* The spine, hinged with the covers (its position, turn and shape follow the covers) */}
        <group ref={spineHinge} position={[0, hinge0, 0]}>
          <mesh ref={spine} geometry={SPINE_GEOMETRY} material={spineMaterials} position={[0, SPINE_Y - hinge0, 0]} />
        </group>

        {/* The right page block (its height is animated) and the right page */}
        <mesh ref={rightBlock} position={[PAGE.w / 2 + GUTTER, COVER_TOP + h0.right / 2, 0]} scale={[1, h0.right / 0.1, 1]} material={materials.pages}>
          <boxGeometry args={[PAGE.w, 0.1, PAGE.d]} />
        </mesh>
        <mesh
          ref={rightPlane}
          geometry={flatPage}
          material={paper.right}
          position={[PAGE.w / 2 + GUTTER, COVER_TOP + h0.right + PAGE_LIFT, 0]}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            if (live.current.mode === "read" && answers()) setHover("next");
          }}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            if (live.current.mode !== "index") return;
            e.stopPropagation();
            setHoveredCell(answers() && atIndex() && e.uv ? indexCellFromUv(e.uv) : null);
          }}
          onPointerOut={() => {
            setHover(null);
            setHoveredCell(null);
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (live.current.mode === "read") {
              turn(e, 1);
              return;
            }
            e.stopPropagation();
            if (e.delta > CLICK_SLOP || !answers() || !atIndex() || !e.uv) return;
            const cell = indexCellFromUv(e.uv);
            if (cell !== null) store.handlers.current.onClickIndexPage?.(cell + 1);
          }}
        >
          {/* The number of the index under the pointer; the pointer passes through it (it would be hit before the page, with its own uv) */}
          <mesh ref={highlight} rotation={[-Math.PI / 2, 0, 0]} visible={false} material={materials.highlight} raycast={NO_RAYCAST}>
            <planeGeometry args={[(INDEX.cellW / INDEX_CANVAS.w) * PAGE.w, (INDEX.cellH / INDEX_CANVAS.h) * PAGE.d]} />
          </mesh>
        </mesh>

        {/* The front half: its cover, the left page block and page, and the ribbon, turned over the spine to close the book */}
        <group ref={frontHinge} position={[0, hinge0, 0]}>
          <group ref={frontHalf} position={[0, -hinge0, 0]}>
            <mesh position={[-COVER.w / 4, COVER_TOP / 2, 0]} material={cover}>
              <boxGeometry args={[COVER.w / 2, COVER_TOP, COVER.d]} />
            </mesh>
            <mesh ref={leftBlock} position={[-PAGE.w / 2 - GUTTER, COVER_TOP + h0.left / 2, 0]} scale={[1, h0.left / 0.1, 1]} material={materials.pages}>
              <boxGeometry args={[PAGE.w, 0.1, PAGE.d]} />
            </mesh>
            <mesh
              ref={leftPlane}
              geometry={flatPage}
              material={paper.left}
              position={[-PAGE.w / 2 - GUTTER, COVER_TOP + h0.left + PAGE_LIFT, 0]}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                if (live.current.mode === "read" && answers()) setHover("prev");
              }}
              onPointerOut={() => setHover(null)}
              onClick={(e: ThreeEvent<MouseEvent>) => turn(e, -1)}
            />
            <group ref={bookmark} position={[0, COVER_TOP + h0.left + RIBBON_LIFT, 0]}>
              <Bookmark y={0} />
            </group>
          </group>
        </group>

        {/* The sheets in the air */}
        {sheets.map((sheet, i) => (
          <primitive key={i} object={sheet.group} />
        ))}
      </group>
    </>
  );
}
