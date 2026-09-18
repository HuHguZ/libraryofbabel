"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useTranslations } from "next-intl";
import { BOOK_GEOMETRY, KEEP_WARM_SPINE } from "../Bookcase";
import { PAGE, type TitlePageText } from "../bookPages";
import { trait } from "../leaves";
import { makeHighlightMaterial } from "../materials";
import { canvasTexture, createCanvas } from "../textTexture";
import { GUTTER } from "./bookSpace";

/*
 * Parts of the book on the desk that hold no state of their own: the page and sheet geometry, the ribbon,
 * the words of the title page, the reader's glide keys, and the materials that keep the book's shaders warm.
 */

const SHEET_SEGMENTS = { x: 36, z: 8 };
/** How far a moving sheet's free edge trails behind at full bend, in radians. */
const CURL = 0.62;
const PAPER = "#f2e8d2";

/** A flat page lying on the table, the spine along x = 0, texture top at the far edge. */
export function pageGeometry(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(PAGE.w, PAGE.d);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A sheet in the air: front and back share one bending surface, hinged at x = 0. */
export interface SheetMesh {
  group: THREE.Group;
  surface: THREE.PlaneGeometry;
  reverse: THREE.BufferGeometry;
  front: THREE.MeshStandardMaterial;
  back: THREE.MeshStandardMaterial;
}

export function makeSheet(blank: THREE.Texture): SheetMesh {
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
  const front = new THREE.MeshStandardMaterial({ map: blank, color: new THREE.Color(PAPER), roughness: 0.9 });
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
export function bendSheet(sheet: SheetMesh, p: number, bend: number, seed: number, time: number, hingeY: number) {
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

/** The silk of the ribbon: one material for every book, never disposed (see DeskBookWarmUp). */
const RIBBON = new THREE.MeshStandardMaterial({ color: new THREE.Color("#7a1f1f"), roughness: 0.7, side: THREE.DoubleSide });

/** Silk bookmark lying in the gutter of the left page and hanging off the bottom edge. */
export function Bookmark({ y }: { y: number }) {
  return (
    <mesh position={[-0.1, y, 0.42]} rotation={[-Math.PI / 2, 0, 0.03]} material={RIBBON}>
      <planeGeometry args={[0.045, 1.5]} />
    </mesh>
  );
}

/** What the title page of a volume says, in the current language. */
export function useTitlePageText(title: string, wall: number, shelf: number, volume: number): TitlePageText {
  const book = useTranslations("Book");
  const common = useTranslations("Common");
  return useMemo(
    () => ({
      title,
      library: book("library"),
      untitled: book("untitled"),
      volume: common("volumeN", { n: volume }),
      location: book("location", { wall, shelf }),
      epigraph: book("epigraph"),
      epigraphSource: book("epigraphSource"),
    }),
    [book, common, title, wall, shelf, volume]
  );
}

export type GlideKey = "up" | "down" | "left" | "right" | "closer" | "farther" | "fast";

/** WASD (any layout) glide the view over the book, ↑ ↓ (or + −) bring it closer or farther; ← → stay with page turning. */
export function glideKey(e: KeyboardEvent): GlideKey | null {
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

/** A throwaway 1×1 texture: filling a texture slot is what shapes a program, not what the texture shows. */
const WARM_TEXTURE = canvasTexture(createCanvas(1, 1)[0]);
/** The back of a sheet in the air (a map on the back faces), a shape nothing in the gallery has. */
const WARM_SHEET_BACK = new THREE.MeshStandardMaterial({ map: WARM_TEXTURE, color: new THREE.Color(PAPER), roughness: 0.9, side: THREE.BackSide });
/**
 * The hover highlight (`materials.highlight`, made by the same factory): the gallery has it too, but compiles it only
 * when a volume is first pointed at, so the index of a book opened by a link would otherwise be its only holder and
 * take it away again.
 */
const WARM_HIGHLIGHT = makeHighlightMaterial();
const WARM_GEOMETRY = new THREE.PlaneGeometry(0.01, 0.01);

/**
 * Keeps compiled, from the moment the world is on the stage, the shaders of every shape that is otherwise
 * only shown once a book comes off its shelf: what the desk book alone draws, and the close-up shelf's titled
 * spines (`KEEP_WARM_SPINE`, the same clone path and texture slots as `DetailedBook` in `Bookcase.tsx`).
 * Never-disposed materials on zero-scale meshes, rendered exactly once here — inside the world, not once per
 * bookcase — so taking a book, turning its first page, putting it back, and opening a shelf close-up never
 * compile or evict a program (spec 3.5). Render it with the world's lights: drawn without them, these
 * materials would keep unlit programs too.
 */
export function DeskBookWarmUp() {
  return (
    <group>
      <mesh geometry={WARM_GEOMETRY} material={WARM_SHEET_BACK} scale={0} frustumCulled={false} />
      <mesh geometry={WARM_GEOMETRY} material={RIBBON} scale={0} frustumCulled={false} />
      <mesh geometry={WARM_GEOMETRY} material={WARM_HIGHLIGHT} scale={0} frustumCulled={false} />
      <mesh geometry={BOOK_GEOMETRY} material={KEEP_WARM_SPINE} scale={0} frustumCulled={false} />
    </group>
  );
}
