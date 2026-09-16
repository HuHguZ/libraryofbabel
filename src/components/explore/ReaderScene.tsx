"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { LIBRARY } from "@/lib/library";
import { useLibraryMaterials } from "./materials";
import { loadSerifFont } from "./textTexture";
import { PAGE, makeBlankPage, makeTextPage, makeTitlePage } from "./bookPages";
import { Bookmark, ReadingTable, useTitlePageText } from "./VolumeScene";
import { setCanvasCursor } from "./cursor";
import { TURN, arrangeLeaves, createLeaves, stepLeaves, trait } from "./leaves";

export interface ReaderSceneProps {
  title: string;
  wall: number;
  shelf: number;
  volume: number;
  /** Spread to show: left page 2k (0 is the title page), right page 2k + 1. */
  spread: number;
  /** Page contents by page number; pages still on their way are drawn blank. */
  contents: Record<number, string>;
  /** Phrase to highlight, already in the Library's alphabet. */
  query: string;
  /** Whenever this changes and the shown spread contains the phrase, the camera glides to the current occurrence. */
  focusToken?: string;
  /** The occurrence of the phrase the reader is at (the first on the spread unless stepped to another one). */
  currentMatch?: { page: number; start: number } | null;
  /** Grows each time the reader steps to another occurrence: such a glide wins over the one to a shared fragment. */
  matchStep?: number;
  /** A fragment of one page to mark in its own colour: character offsets into that page's text, the end exclusive. */
  mark?: { page: number; start: number; end: number } | null;
  /** Colour of the mark, "#rrggbb". */
  markColor?: string;
  /** Whenever this changes, the camera glides to the marked fragment once the book lies open at it. */
  markFocusToken?: string;
  onHoverPage?: (which: "prev" | "next" | null) => void;
  onTurn?: (direction: 1 | -1) => void;
  onInteract?: () => void;
}

type Controls = ComponentRef<typeof OrbitControls>;

const COVER_TOP = 0.05;
const GUTTER = 0.035;
/** Heights above the page block: the open page, the ribbon on it, the pages being turned (over both). */
const PAGE_LIFT = 0.001;
const RIBBON_LIFT = 0.002;
const FLIP_LIFT = 0.0035;
/** The view of the whole book on the table, where the reader starts. */
const HOME_POSITION = new THREE.Vector3(0.2, 2.25, 2.05);
const HOME_TARGET = new THREE.Vector3(0, 0.16, 0.1);
/** Where the view may wander: the point looked at stays over the book. */
const VIEW_BOUNDS = { x: PAGE.w + GUTTER - 0.05, z: PAGE.d / 2 - 0.02, yMin: 0.05, yMax: 0.26 };
/** Zoomed out past the starting view, the view drifts back over the whole book. */
const OVERVIEW_DISTANCE = { from: HOME_POSITION.distanceTo(HOME_TARGET) + 0.25, to: 4.2 };
const MIN_DISTANCE = 0.32;
const MAX_DISTANCE = 4.2;
const CLICK_SLOP = 5;

/** Leaf k carries page 2k + 1 on its front and page 2k + 2 on its back (see leaves.ts). */
const LEAVES = Math.floor(LIBRARY.pages / 2);
const SHEET_SEGMENTS = { x: 36, z: 8 };
/** How far a moving sheet's free edge trails behind at full bend, in radians. */
const CURL = 0.62;
/** Page textures kept drawn and uploaded; the shown spread and its neighbours are always among them. */
const CACHE_LIMIT = 12;

interface PageTex {
  key: string;
  texture: THREE.CanvasTexture;
  first: { x: number; y: number } | null;
  /** Where the current occurrence of the phrase is on this page, if it is here. */
  current: { x: number; y: number } | null;
  /** Centre of the marked fragment on this page, if it has one. */
  mark: { x: number; y: number } | null;
}

/** Thickness of the page blocks left and right of the gutter once `turned` leaves lie on the left. */
function blockHeights(turned: number): { left: number; right: number } {
  const read = Math.min(1, (2 * turned) / LIBRARY.pages);
  return { left: 0.015 + 0.105 * read, right: 0.015 + 0.105 * (1 - read) };
}

/** A flat page lying on the table, the spine along x = 0, texture top at the far edge. */
function pageGeometry(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(PAGE.w, PAGE.d);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A sheet in the air: front and back share one bending surface, hinged at x = 0. */
interface SheetMesh {
  group: THREE.Group;
  surface: THREE.PlaneGeometry;
  reverse: THREE.BufferGeometry;
  front: THREE.MeshStandardMaterial;
  back: THREE.MeshStandardMaterial;
}

function makeSheet(blank: THREE.Texture): SheetMesh {
  const surface = new THREE.PlaneGeometry(PAGE.w, PAGE.d, SHEET_SEGMENTS.x, SHEET_SEGMENTS.z);
  surface.rotateX(-Math.PI / 2);
  surface.translate(PAGE.w / 2, 0, 0);
  const reverse = new THREE.BufferGeometry();
  reverse.setIndex(surface.getIndex());
  reverse.setAttribute("position", surface.getAttribute("position"));
  reverse.setAttribute("normal", surface.getAttribute("normal"));
  const uv = surface.getAttribute("uv").clone() as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  reverse.setAttribute("uv", uv);
  const front = new THREE.MeshStandardMaterial({ map: blank, color: new THREE.Color("#f2e8d2"), roughness: 0.9 });
  const back = front.clone();
  back.side = THREE.BackSide;
  const group = new THREE.Group();
  group.visible = false;
  // The vertices swing far from the resting bounds, so a stale bounding sphere must never cull them.
  for (const mesh of [new THREE.Mesh(surface, front), new THREE.Mesh(reverse, back)]) {
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return { group, surface, reverse, front, back };
}

/**
 * Bends a sheet at progress p (0 on the right, 1 on the left). Each row of vertices is laid out along
 * its own arc, so the paper never stretches. The turn's seed decides the rest: which corner trails,
 * whether the sheet cups or bows, where along it the paper gives, and how its edge ripples in the air.
 */
function bendSheet(sheet: SheetMesh, p: number, bend: number, seed: number, time: number, hingeY: number) {
  const pos = sheet.surface.getAttribute("position") as THREE.BufferAttribute;
  const angle = p * Math.PI;
  const air = Math.sin(angle);
  const lag = CURL * bend * air;
  // Mostly the far corner trails (the page is taken by its near corner), now and then the other way round.
  const twist = -0.25 + 0.85 * trait(seed, 5);
  const cup = (trait(seed, 6) * 2 - 1) * 0.45;
  // 0: the paper gives near the free edge, 1: evenly along the sheet.
  const even = 0.25 + 0.75 * trait(seed, 7);
  const ripple = (0.03 + 0.1 * trait(seed, 8)) * air * Math.min(1, 0.35 + Math.abs(bend));
  const rippleSpeed = 2.5 + 4 * trait(seed, 9);
  const ripplePhase = trait(seed, 10) * Math.PI * 2;
  const waves = 0.5 + 1.1 * trait(seed, 11);
  const slant = (trait(seed, 12) * 2 - 1) * 1.6;
  const hingeX = GUTTER * Math.cos(angle);
  const y0 = hingeY + GUTTER * 0.5 * air;
  const cols = SHEET_SEGMENTS.x + 1;
  const step = PAGE.w / SHEET_SEGMENTS.x;
  for (let row = 0; row <= SHEET_SEGMENTS.z; row++) {
    const zn = (row / SHEET_SEGMENTS.z) * 2 - 1; // -1 at the far edge, 1 at the near one
    const z = (zn * PAGE.d) / 2;
    const rowLag = lag * (1 - twist * zn + cup * (zn * zn - 0.35));
    let x = hingeX;
    let y = y0;
    pos.setXYZ(row * cols, x, y, z);
    for (let col = 1; col < cols; col++) {
      const u = (col - 0.5) / SHEET_SEGMENTS.x;
      const give = even * u + (1 - even) * u * u;
      const wave = ripple * u * Math.sin(Math.PI * 2 * (waves * u - rippleSpeed * time * 0.25) + ripplePhase + slant * zn);
      // Never below the stacks: the paper cannot dip under the page it lies over.
      const a = THREE.MathUtils.clamp(angle - rowLag * give - wave, 0.0015, Math.PI - 0.0015);
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pos.setXYZ(row * cols + col, x, y, z);
    }
  }
  pos.needsUpdate = true;
  sheet.surface.computeVertexNormals();
}

function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.copy(HOME_POSITION);
    camera.fov = 44;
    camera.near = 0.02;
    camera.far = 40;
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

type GlideKey = "up" | "down" | "left" | "right" | "closer" | "farther" | "fast";

/** WASD (any layout) glide the view over the book, ↑ ↓ (or + −) bring it closer or farther; ← → stay with page turning. */
function glideKey(e: KeyboardEvent): GlideKey | null {
  switch (e.code) {
    case "KeyW":
      return "up";
    case "KeyS":
      return "down";
    case "KeyA":
      return "left";
    case "KeyD":
      return "right";
    case "ArrowUp":
    case "Equal":
    case "NumpadAdd":
      return "closer";
    case "ArrowDown":
    case "Minus":
    case "NumpadSubtract":
      return "farther";
    case "ShiftLeft":
    case "ShiftRight":
      return "fast";
  }
  // The key code can be empty (embedded browsers); fall back to the character, Russian layout included.
  switch (e.key) {
    case "w":
    case "W":
    case "ц":
    case "Ц":
      return "up";
    case "s":
    case "S":
    case "ы":
    case "Ы":
      return "down";
    case "a":
    case "A":
    case "ф":
    case "Ф":
      return "left";
    case "d":
    case "D":
    case "в":
    case "В":
      return "right";
    case "ArrowUp":
    case "+":
    case "=":
      return "closer";
    case "ArrowDown":
    case "-":
      return "farther";
    case "Shift":
      return "fast";
  }
  return null;
}

export default function ReaderScene({ title, wall, shelf, volume, spread, contents, query, focusToken, currentMatch, matchStep, mark, markColor, markFocusToken, onHoverPage, onTurn, onInteract }: ReaderSceneProps) {
  const titleText = useTitlePageText(title, wall, shelf, volume);
  const materials = useLibraryMaterials();
  const gl = useThree((s) => s.gl);
  const [family, setFamily] = useState<string | null>(null);
  const controlsRef = useRef<Controls>(null);

  const callbacks = useRef({ onHoverPage, onTurn, onInteract });
  useLayoutEffect(() => {
    callbacks.current = { onHoverPage, onTurn, onInteract };
  });

  /* ── Turning: the requested spread, and the leaves that move towards it ── */
  const [leaves] = useState(() => createLeaves(LEAVES, spread));
  const target = useRef(spread);
  const heading = useRef<1 | -1>(1);
  useLayoutEffect(() => {
    if (spread !== target.current) heading.current = spread > target.current ? 1 : -1;
    target.current = spread;
  }, [spread]);

  useEffect(() => {
    let alive = true;
    loadSerifFont().then((f) => {
      if (alive) setFamily(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* ── Page textures: drawn and uploaded ahead of time, so a page never shows up blank or late ── */
  const blank = useMemo(() => makeBlankPage(materials.textures.parchment), [materials]);
  useEffect(() => () => blank.dispose(), [blank]);

  const inputs = useRef({ family, contents, query, currentMatch, mark, markColor, title, titleText, parchment: materials.textures.parchment });
  useLayoutEffect(() => {
    inputs.current = { family, contents, query, currentMatch, mark, markColor, title, titleText, parchment: materials.textures.parchment };
  });

  const cache = useRef(new Map<number, PageTex>());
  useEffect(() => {
    const all = cache.current;
    return () => {
      for (const tex of all.values()) tex.texture.dispose();
      all.clear();
    };
  }, []);

  /** What a page looks like right now, or null while it cannot be drawn yet (no font or no text). */
  const pageKey = (page: number): string | null => {
    const { family: f, contents: c, query: q, currentMatch: cm, mark: m, markColor: mc, title: tl, titleText: tt } = inputs.current;
    if (!f || page < 0 || page > LIBRARY.pages) return null;
    if (page === 0) return `title|${tl}|${tt.library}|${tt.untitled}|${tt.volume}|${tt.location}|${tt.epigraph}`;
    if (c[page] === undefined) return null;
    // Only the pages carrying the mark or the current occurrence are redrawn when those move.
    return `${q}|${tl}|${tt.untitled}|${m?.page === page ? `${m.start}-${m.end}-${mc}` : ""}|${cm?.page === page ? cm.start : ""}`;
  };

  const drawPage = (page: number, key: string): PageTex => {
    const { family: f, contents: c, query: q, currentMatch: cm, mark: m, markColor: mc, title: tl, titleText: tt, parchment } = inputs.current;
    const tex: PageTex =
      page === 0
        ? { key, texture: makeTitlePage(f!, parchment, tt), first: null, current: null, mark: null }
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
            return { key, texture: r.texture, first: r.firstMatch, current: r.currentMatch, mark: r.markCenter };
          })();
    // Upload now rather than on the frame the page first shows, then let go of the canvas: the GPU copy is all that is drawn.
    gl.initTexture(tex.texture);
    const canvas = tex.texture.image as HTMLCanvasElement;
    canvas.width = 1;
    canvas.height = 1;
    cache.current.get(page)?.texture.dispose();
    cache.current.set(page, tex);
    return tex;
  };

  /* ── Materials and geometry ── */
  const paper = useMemo(() => {
    const make = () => new THREE.MeshStandardMaterial({ map: blank, color: new THREE.Color("#f2e8d2"), roughness: 0.9 });
    return { left: make(), right: make() };
  }, [blank]);
  useEffect(() => () => Object.values(paper).forEach((m) => m.dispose()), [paper]);

  const sheets = useMemo(() => Array.from({ length: TURN.sheets }, () => makeSheet(blank)), [blank]);
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
  const hover = useRef<"prev" | "next" | null>(null);

  /* ── Camera glides: to the current occurrence of the phrase, or back over the whole book ── */
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
    focus.current.target.copy(HOME_TARGET);
    focus.current.position.copy(HOME_POSITION);
    focus.current.active = true;
  };

  // Stepping to another occurrence is the reader's own request: it may take the view away from a shared fragment.
  useEffect(() => {
    if (matchStep) markGlided.current = null;
  }, [matchStep]);

  /** Glides over a spot of an open page, given as fractions of the page, with the page blocks this high. */
  const glideToSpot = (page: number, at: { x: number; y: number }, heights: { left: number; right: number }) => {
    const isLeft = page % 2 === 0;
    const x = isLeft ? -GUTTER - PAGE.w + at.x * PAGE.w : GUTTER + at.x * PAGE.w;
    const y = COVER_TOP + (isLeft ? heights.left : heights.right);
    const z = -PAGE.d / 2 + at.y * PAGE.d;
    focus.current.target.set(x, y, z);
    focus.current.position.set(x, y + 0.78, z + 0.5);
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
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Home" || e.key === "Home") {
        e.preventDefault();
        glideHome();
        callbacks.current.onInteract?.();
        return;
      }
      const key = glideKey(e);
      if (!key) return;
      if (key !== "fast") {
        e.preventDefault();
        focus.current.active = false;
        callbacks.current.onInteract?.();
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
  }, []);

  const setHover = (which: "prev" | "next" | null) => {
    if (hover.current === which) return;
    hover.current = which;
    setCanvasCursor(gl.domElement, which !== null);
    callbacks.current.onHoverPage?.(which);
  };
  useEffect(() => () => setCanvasCursor(gl.domElement, false), [gl]);

  // Development aid: the console can watch the leaves, the page textures and the view, and slow the turns down (window.__reader).
  const camera = useThree((s) => s.camera);
  const timeScale = useRef(1);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __reader?: unknown }).__reader = {
      leaves,
      cache: cache.current,
      controls: controlsRef,
      camera,
      arrange: () => arrangeLeaves(leaves),
      setTimeScale: (scale: number) => (timeScale.current = scale),
    };
  }, [leaves, camera]);

  const glide = useRef(new THREE.Vector3());
  const zoomRate = useRef(0);
  const scratch = useRef({ forward: new THREE.Vector3(), side: new THREE.Vector3(), move: new THREE.Vector3() });

  useFrame((state, dt) => {
    const step = Math.min(dt, 0.05);
    const goal = target.current;
    stepLeaves(leaves, goal, step * timeScale.current);
    const arranged = arrangeLeaves(leaves);

    /* Textures: whatever is on screen is drawn at once; the pages around the requested spread, one per frame. */
    const all = cache.current;
    let drewNow = false;
    const textureOf = (page: number): THREE.Texture => {
      const key = pageKey(page);
      if (!key) return blank;
      const cached = all.get(page);
      if (cached && cached.key === key) return cached.texture;
      drewNow = true;
      return drawPage(page, key).texture;
    };
    const shown = [2 * arranged.left, 2 * arranged.right + 1];
    paper.left.map = textureOf(shown[0]);
    paper.right.map = textureOf(shown[1]);

    const { left: hl, right: hr } = blockHeights(arranged.turned);
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];
      const s = arranged.sheets[i];
      sheet.group.visible = !!s;
      if (!s) continue;
      shown.push(2 * s.from + 1, 2 * s.to + 2);
      sheet.front.map = textureOf(2 * s.from + 1);
      sheet.back.map = textureOf(2 * s.to + 2);
      bendSheet(sheet, s.p, s.bend, s.seed, state.clock.elapsedTime, COVER_TOP + THREE.MathUtils.lerp(hr, hl, s.p) + FLIP_LIFT);
    }

    const ahead = heading.current;
    const upcoming = [2 * goal, 2 * goal + 1, 2 * goal + 2 * ahead, 2 * goal + 1 + 2 * ahead, 2 * goal - 2 * ahead, 2 * goal + 1 - 2 * ahead, 2 * goal + 4 * ahead, 2 * goal + 1 + 4 * ahead];
    if (!drewNow) {
      for (const page of upcoming) {
        const key = pageKey(page);
        if (!key || all.get(page)?.key === key) continue;
        drawPage(page, key);
        break;
      }
    }
    if (all.size > CACHE_LIMIT) {
      const keep = new Set([...shown, ...upcoming]);
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
        const cm = inputs.current.currentMatch;
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
      const m = inputs.current.mark;
      const pages = [2 * goal, 2 * goal + 1];
      if (!m || !pages.includes(m.page)) {
        pendingMark.current = null;
      } else if (pages.every((page) => page === 0 || page > LIBRARY.pages || (!!all.get(page) && all.get(page)!.key === pageKey(page)))) {
        pendingMark.current = null;
        const at = all.get(m.page)?.mark;
        if (at) {
          glideToSpot(m.page, at, { left: hl, right: hr });
          markGlided.current = goal;
        }
      }
    }

    const controls = controlsRef.current;
    if (!controls) return;
    const cam = state.camera;
    const fc = focus.current;
    if (fc.active) {
      controls.target.x = THREE.MathUtils.damp(controls.target.x, fc.target.x, 5, step);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, fc.target.y, 5, step);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, fc.target.z, 5, step);
      cam.position.x = THREE.MathUtils.damp(cam.position.x, fc.position.x, 5, step);
      cam.position.y = THREE.MathUtils.damp(cam.position.y, fc.position.y, 5, step);
      cam.position.z = THREE.MathUtils.damp(cam.position.z, fc.position.z, 5, step);
      if (cam.position.distanceTo(fc.position) < 0.01) fc.active = false;
    }

    /* Keys glide the view across the table, slower the closer the eye is to the page. */
    const { forward, side, move } = scratch.current;
    const keys = held.current;
    const fast = keys.has("fast") ? 2.5 : 1;
    const offset = side.subVectors(cam.position, controls.target);
    const zoom = (keys.has("farther") ? 1 : 0) - (keys.has("closer") ? 1 : 0);
    zoomRate.current = THREE.MathUtils.damp(zoomRate.current, zoom * 1.1 * fast, 10, step);
    if (Math.abs(zoomRate.current) > 1e-4) {
      const length = offset.length();
      const next = THREE.MathUtils.clamp(length * Math.exp(zoomRate.current * step), MIN_DISTANCE, MAX_DISTANCE);
      offset.multiplyScalar(next / length);
      cam.position.copy(controls.target).add(offset);
    }
    const distance = offset.length();
    forward.set(-offset.x, 0, -offset.z);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
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

    // Zoomed far out, the view drifts back over the whole book.
    const drift = THREE.MathUtils.smoothstep(distance, OVERVIEW_DISTANCE.from, OVERVIEW_DISTANCE.to) * (1 - Math.exp(-2.5 * step));
    move.x += (HOME_TARGET.x - controls.target.x) * drift;
    move.z += (HOME_TARGET.z - controls.target.z) * drift;

    // The point looked at stays over the book; the camera moves with it.
    move.x = THREE.MathUtils.clamp(controls.target.x + move.x, -VIEW_BOUNDS.x, VIEW_BOUNDS.x) - controls.target.x;
    move.z = THREE.MathUtils.clamp(controls.target.z + move.z, -VIEW_BOUNDS.z, VIEW_BOUNDS.z) - controls.target.z;
    move.y = THREE.MathUtils.clamp(controls.target.y, VIEW_BOUNDS.yMin, VIEW_BOUNDS.yMax) - controls.target.y;
    if (move.lengthSq() > 0) {
      controls.target.add(move);
      cam.position.add(move);
    }
  });

  const cover = materials.books[0].cover;
  const h0 = blockHeights(spread);

  /** A click that ends a drag across the page moved the view; it does not turn the page. */
  const turn = (e: ThreeEvent<MouseEvent>, direction: 1 | -1) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    callbacks.current.onTurn?.(direction);
  };

  return (
    <group>
      <CameraRig />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={HOME_TARGET.toArray()}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        minPolarAngle={0.05}
        maxPolarAngle={1.25}
        minAzimuthAngle={-0.95}
        maxAzimuthAngle={0.95}
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
          callbacks.current.onInteract?.();
        }}
      />
      <ReadingTable />

      {/* Cover and spine */}
      <mesh position={[0, COVER_TOP / 2, 0]} material={cover}>
        <boxGeometry args={[3.02, COVER_TOP, 2.14]} />
      </mesh>
      <mesh position={[0, COVER_TOP + 0.06, 0]} material={cover}>
        <boxGeometry args={[0.07, 0.13, 2.1]} />
      </mesh>

      {/* Page blocks (their height is animated) */}
      <mesh ref={leftBlock} position={[-PAGE.w / 2 - GUTTER, COVER_TOP + h0.left / 2, 0]} scale={[1, h0.left / 0.1, 1]} material={materials.pages}>
        <boxGeometry args={[PAGE.w, 0.1, PAGE.d]} />
      </mesh>
      <mesh ref={rightBlock} position={[PAGE.w / 2 + GUTTER, COVER_TOP + h0.right / 2, 0]} scale={[1, h0.right / 0.1, 1]} material={materials.pages}>
        <boxGeometry args={[PAGE.w, 0.1, PAGE.d]} />
      </mesh>

      {/* The two open pages */}
      <mesh
        ref={leftPlane}
        geometry={flatPage}
        material={paper.left}
        position={[-PAGE.w / 2 - GUTTER, COVER_TOP + h0.left + PAGE_LIFT, 0]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover("prev");
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => turn(e, -1)}
      />
      <mesh
        ref={rightPlane}
        geometry={flatPage}
        material={paper.right}
        position={[PAGE.w / 2 + GUTTER, COVER_TOP + h0.right + PAGE_LIFT, 0]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover("next");
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => turn(e, 1)}
      />

      {/* The sheets in the air */}
      {sheets.map((sheet, i) => (
        <primitive key={i} object={sheet.group} />
      ))}

      <group ref={bookmark} position={[0, COVER_TOP + h0.left + RIBBON_LIFT, 0]}>
        <Bookmark y={0} />
      </group>
    </group>
  );
}
