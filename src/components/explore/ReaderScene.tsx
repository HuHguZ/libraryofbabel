"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { LIBRARY } from "@/lib/library";
import { useLibraryMaterials } from "./materials";
import { loadSerifFont } from "./textTexture";
import { PAGE, makeBlankPage, makeTextPage, makeTitlePage } from "./bookPages";
import { Bookmark, ReadingTable } from "./VolumeScene";
import { setCanvasCursor } from "./cursor";

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
  /** Whenever this changes and the shown spread contains the phrase, the camera glides to its first occurrence. */
  focusToken?: string;
  onHoverPage?: (which: "prev" | "next" | null) => void;
  onTurn?: (direction: 1 | -1) => void;
  onInteract?: () => void;
}

type Controls = ComponentRef<typeof OrbitControls>;

const COVER_TOP = 0.05;
const GUTTER = 0.035;
/** Heights above the page block: the open page, the ribbon on it, the page being turned (over both). */
const PAGE_LIFT = 0.001;
const RIBBON_LIFT = 0.002;
const FLIP_LIFT = 0.0035;
/** The view of the whole book on the table, where the reader starts. */
const HOME_POSITION = new THREE.Vector3(0.2, 2.25, 2.05);
const HOME_TARGET = new THREE.Vector3(0, 0.16, 0.1);
const FLIP_SECONDS = 0.95;
const FLIP_SEGMENTS = 40;
const CURL = 0.55;

interface PageTex {
  key: string;
  texture: THREE.CanvasTexture;
  first: { x: number; y: number } | null;
}

/** Thickness of the page blocks left and right of the gutter for spread k. */
function blockHeights(k: number): { left: number; right: number } {
  const read = Math.min(LIBRARY.pages, 2 * k) / LIBRARY.pages;
  return { left: 0.015 + 0.105 * read, right: 0.015 + 0.105 * (1 - read) };
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** A flat page lying on the table, the spine along x = 0, texture top at the far edge. */
function pageGeometry(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(PAGE.w, PAGE.d);
  g.rotateX(-Math.PI / 2);
  return g;
}

function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.copy(HOME_POSITION);
    camera.fov = 44;
    camera.near = 0.05;
    camera.far = 40;
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

export default function ReaderScene({ title, wall, shelf, volume, spread, contents, query, focusToken, onHoverPage, onTurn, onInteract }: ReaderSceneProps) {
  const materials = useLibraryMaterials();
  const gl = useThree((s) => s.gl);
  const [family, setFamily] = useState<string | null>(null);
  const [shown, setShown] = useState(spread);
  const controlsRef = useRef<Controls>(null);

  const callbacks = useRef({ onHoverPage, onTurn, onInteract });
  useLayoutEffect(() => {
    callbacks.current = { onHoverPage, onTurn, onInteract };
  });
  const target = useRef(spread);
  useLayoutEffect(() => {
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

  /* ── Page textures: the shown spread, the spread being turned to, drawn once per content + phrase ── */
  const blank = useMemo(() => makeBlankPage(materials.textures.parchment), [materials]);
  useEffect(() => () => blank.dispose(), [blank]);

  const cache = useRef(new Map<number, PageTex>());
  const pages = useMemo(() => {
    const needed = new Set([2 * shown, 2 * shown + 1, 2 * spread, 2 * spread + 1]);
    const out = new Map<number, PageTex>();
    if (family) {
      for (const page of needed) {
        if (page < 0 || page > LIBRARY.pages) continue;
        const content = page === 0 ? "" : contents[page];
        const key = page === 0 ? `title|${title}` : content ? `${page}|${query}|${title}` : "";
        if (!key) continue;
        const cached = cache.current.get(page);
        if (cached && cached.key === key) {
          out.set(page, cached);
          continue;
        }
        cached?.texture.dispose();
        const tex: PageTex =
          page === 0
            ? { key, texture: makeTitlePage(family, materials.textures.parchment, { title, wall, shelf, volume }), first: null }
            : (() => {
                const r = makeTextPage(family, materials.textures.parchment, { content: content!, page, title, side: page % 2 === 0 ? "left" : "right", query });
                return { key, texture: r.texture, first: r.firstMatch };
              })();
        cache.current.set(page, tex);
        out.set(page, tex);
      }
    }
    return out;
  }, [family, shown, spread, contents, query, title, wall, shelf, volume, materials]);

  useEffect(() => {
    const keep = pages;
    const all = cache.current;
    for (const [page, tex] of all) {
      if (keep.get(page) !== tex) {
        tex.texture.dispose();
        all.delete(page);
      }
    }
  }, [pages]);
  useEffect(() => {
    const all = cache.current;
    return () => {
      for (const tex of all.values()) tex.texture.dispose();
      all.clear();
    };
  }, []);

  /* ── Materials and geometry ── */
  const paper = useMemo(() => {
    const make = () => new THREE.MeshStandardMaterial({ map: blank, color: new THREE.Color("#f2e8d2"), roughness: 0.9 });
    const back = make();
    back.side = THREE.BackSide;
    return { left: make(), right: make(), front: make(), back };
  }, [blank]);
  useEffect(() => () => Object.values(paper).forEach((m) => m.dispose()), [paper]);

  const flipGeometry = useMemo(() => {
    const front = new THREE.PlaneGeometry(PAGE.w, PAGE.d, FLIP_SEGMENTS, 1);
    front.rotateX(-Math.PI / 2);
    front.translate(PAGE.w / 2, 0, 0);
    const back = new THREE.BufferGeometry();
    back.setIndex(front.getIndex());
    back.setAttribute("position", front.getAttribute("position"));
    back.setAttribute("normal", front.getAttribute("normal"));
    const uv = front.getAttribute("uv").clone() as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    back.setAttribute("uv", uv);
    const rest = (front.getAttribute("position") as THREE.BufferAttribute).array.slice() as Float32Array;
    return { front, back, rest };
  }, []);
  useEffect(
    () => () => {
      flipGeometry.front.dispose();
      flipGeometry.back.dispose();
    },
    [flipGeometry]
  );
  const flatPage = useMemo(() => pageGeometry(), []);
  useEffect(() => () => flatPage.dispose(), [flatPage]);

  const leftPlane = useRef<THREE.Mesh>(null);
  const rightPlane = useRef<THREE.Mesh>(null);
  const leftBlock = useRef<THREE.Mesh>(null);
  const rightBlock = useRef<THREE.Mesh>(null);
  const flipGroup = useRef<THREE.Group>(null);
  const bookmark = useRef<THREE.Group>(null);

  /* ── Flip animation state (mutable, driven per frame) ── */
  const flip = useRef<{ from: number; to: number; dir: 1 | -1; p: number } | null>(null);
  const shownRef = useRef(shown);
  const hover = useRef<"prev" | "next" | null>(null);

  /* ── Camera glide to the first highlighted phrase ── */
  const focus = useRef<{ target: THREE.Vector3; position: THREE.Vector3; active: boolean }>({
    target: new THREE.Vector3(),
    position: new THREE.Vector3(),
    active: false,
  });
  const lastFocus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!focusToken || focusToken === lastFocus.current || !query) return;
    const left = pages.get(2 * shown);
    const right = pages.get(2 * shown + 1);
    const hit = left?.first ? { page: 2 * shown, at: left.first } : right?.first ? { page: 2 * shown + 1, at: right.first } : null;
    if (!hit) return;
    lastFocus.current = focusToken;
    const h = blockHeights(shown);
    const isLeft = hit.page % 2 === 0;
    const x = isLeft ? -GUTTER - PAGE.w + hit.at.x * PAGE.w : GUTTER + hit.at.x * PAGE.w;
    const y = COVER_TOP + (isLeft ? h.left : h.right);
    const z = -PAGE.d / 2 + hit.at.y * PAGE.d;
    focus.current.target.set(x, y, z);
    focus.current.position.set(x, y + 0.78, z + 0.5);
    focus.current.active = true;
  }, [focusToken, query, pages, shown]);

  /* ── Clearing the phrase brings the camera back over the whole book ── */
  const lastQuery = useRef(query);
  useEffect(() => {
    const had = lastQuery.current;
    lastQuery.current = query;
    if (!had || query) return;
    focus.current.target.copy(HOME_TARGET);
    focus.current.position.copy(HOME_POSITION);
    focus.current.active = true;
    lastFocus.current = undefined;
  }, [query]);

  const setHover = (which: "prev" | "next" | null) => {
    if (hover.current === which) return;
    hover.current = which;
    setCanvasCursor(gl.domElement, which !== null);
    callbacks.current.onHoverPage?.(which);
  };
  useEffect(() => () => setCanvasCursor(gl.domElement, false), [gl]);

  useFrame((state, dt) => {
    const step = Math.min(dt, 0.05);
    // Start a turn when the requested spread differs from the one on the table.
    if (!flip.current && target.current !== shownRef.current) {
      const from = shownRef.current;
      const to = target.current;
      const dir = to > from ? 1 : -1;
      flip.current = { from, to, dir, p: dir === 1 ? 0 : 1 };
    }
    const f = flip.current;
    const texFor = (page: number) => pages.get(page)?.texture ?? blank;

    let leftPage: number;
    let rightPage: number;
    let t = 0;
    if (f) {
      f.p += (f.dir * step) / FLIP_SECONDS;
      const done = f.dir === 1 ? f.p >= 1 : f.p <= 0;
      if (done) {
        flip.current = null;
        shownRef.current = f.to;
        setShown(f.to);
        leftPage = 2 * f.to;
        rightPage = 2 * f.to + 1;
        t = 0;
      } else {
        // A forward turn from a to b and the backward turn from b to a are the same motion, played in opposite directions.
        const a = Math.min(f.from, f.to);
        const b = Math.max(f.from, f.to);
        leftPage = 2 * a;
        rightPage = 2 * b + 1;
        t = smoothstep(THREE.MathUtils.clamp(f.p, 0, 1));
        paper.front.map = texFor(2 * a + 1);
        paper.back.map = texFor(2 * b);
      }
    } else {
      leftPage = 2 * shownRef.current;
      rightPage = 2 * shownRef.current + 1;
    }
    paper.left.map = texFor(leftPage);
    paper.right.map = texFor(rightPage);

    // Page blocks grow and shrink as the book is read.
    const from = f ? blockHeights(Math.min(f.from, f.to)) : blockHeights(shownRef.current);
    const to = f ? blockHeights(Math.max(f.from, f.to)) : from;
    const hl = THREE.MathUtils.lerp(from.left, to.left, t);
    const hr = THREE.MathUtils.lerp(from.right, to.right, t);
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

    // The turning page: a rigid swing about the spine with a lag towards the fore-edge, so it curls.
    const g = flipGroup.current;
    if (g) {
      g.visible = !!f && !!flip.current;
      if (g.visible) {
        const pos = flipGeometry.front.getAttribute("position") as THREE.BufferAttribute;
        const rest = flipGeometry.rest;
        const angle = t * Math.PI;
        const lift = THREE.MathUtils.lerp(from.right, to.left, t) + COVER_TOP + FLIP_LIFT;
        const spine = GUTTER * Math.cos(angle);
        for (let i = 0; i < pos.count; i++) {
          const x0 = rest[i * 3];
          const z0 = rest[i * 3 + 2];
          const u = x0 / PAGE.w;
          const a = angle - CURL * u * Math.sin(angle);
          pos.setXYZ(i, Math.cos(a) * x0 + spine, Math.sin(a) * x0 + lift, z0);
        }
        pos.needsUpdate = true;
        flipGeometry.front.computeVertexNormals();
      }
    }

    // Glide the camera to a highlighted phrase.
    const fc = focus.current;
    const controls = controlsRef.current;
    if (fc.active && controls) {
      controls.target.x = THREE.MathUtils.damp(controls.target.x, fc.target.x, 5, step);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, fc.target.y, 5, step);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, fc.target.z, 5, step);
      const cam = state.camera;
      cam.position.x = THREE.MathUtils.damp(cam.position.x, fc.position.x, 5, step);
      cam.position.y = THREE.MathUtils.damp(cam.position.y, fc.position.y, 5, step);
      cam.position.z = THREE.MathUtils.damp(cam.position.z, fc.position.z, 5, step);
      if (cam.position.distanceTo(fc.position) < 0.01) fc.active = false;
    }
  });

  const cover = materials.books[0].cover;
  const h0 = blockHeights(spread);

  return (
    <group>
      <CameraRig />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={HOME_TARGET.toArray()}
        minDistance={0.7}
        maxDistance={4.2}
        minPolarAngle={0.2}
        maxPolarAngle={1.25}
        minAzimuthAngle={-0.95}
        maxAzimuthAngle={0.95}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
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
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          callbacks.current.onTurn?.(-1);
        }}
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
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          callbacks.current.onTurn?.(1);
        }}
      />

      {/* The page being turned: front and back share one bending surface. Its vertices swing far
          from the resting bounds, so it is never frustum-culled by a stale bounding sphere. */}
      <group ref={flipGroup} visible={false}>
        <mesh geometry={flipGeometry.front} material={paper.front} frustumCulled={false} />
        <mesh geometry={flipGeometry.back} material={paper.back} frustumCulled={false} />
      </group>

      <group ref={bookmark} position={[0, COVER_TOP + h0.left + RIBBON_LIFT, 0]}>
        <Bookmark y={0} />
      </group>
    </group>
  );
}
