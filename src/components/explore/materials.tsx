"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createRandom } from "@/lib/hex";
import { TINT_GROUPS } from "./bookcasePlan";
import { canvasTexture, createCanvas } from "./textTexture";

export { TINT_GROUPS };

export const GOLD = "#c9a84c";
export const GOLD_LIGHT = "#f0d890";
export const LAMP_COLOR = "#ffcf8a";

/** Generated material variants (public/textures/*.webp). The first entry of each list is the "canonical" gallery. */
export const VARIANTS = {
  floor: ["stone", "floor_flagstone", "floor_basalt", "floor_marble", "floor_terracotta"],
  wall: ["plaster", "wall_cracked", "wall_limewash", "wall_stained", "wall_brick"],
  ceiling: ["plaster", "ceiling_soot", "ceiling_beams"],
  wood: ["wood", "wood_oak", "wood_ebony", "wood_mahogany", "wood_worn"],
  leather: ["leather_gray", "leather_pebbled", "leather_smooth", "leather_cracked", "leather_suede", "leather_scuffed", "leather_embossed", "leather_cloth", "leather_vellum"],
  parchment: ["parchment", "parchment_dark", "parchment_pale"],
} as const;

/** Leather tones. Borges describes volumes of uniform format; only the bindings differ, and only within reason. */
export const PALETTE = [
  "#6a4530", "#7a2f2f", "#37543f", "#33395c", "#4a3a2e", "#8a6a48", "#2b282c", "#5c3846",
  "#5a5a34", "#8a4a2a", "#2f4f4f", "#5e1f2a", "#3f4a66", "#9a7a3a", "#4b5a3a", "#5b5550",
  "#6e3b1e", "#2c4a5e", "#7b5c2e", "#3c2f45",
];

export interface GalleryPlan {
  floor: string;
  wall: string;
  ceiling: string;
  wood: string;
  leathers: [string, string, string];
  parchment: string;
  tints: string[];
}

const textureUrl = (name: string) => `/textures/${name}.webp`;

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)];
}

/** Every gallery address decides its own materials and binding colours, deterministically. */
export function planGallery(seed: number): GalleryPlan {
  if (!seed) {
    return {
      floor: VARIANTS.floor[0],
      wall: VARIANTS.wall[0],
      ceiling: VARIANTS.ceiling[0],
      wood: VARIANTS.wood[0],
      leathers: [VARIANTS.leather[0], VARIANTS.leather[1], VARIANTS.leather[2]],
      parchment: VARIANTS.parchment[0],
      tints: PALETTE.slice(0, TINT_GROUPS),
    };
  }
  const rand = createRandom(seed);
  const leatherPool = [...VARIANTS.leather];
  const leathers = Array.from({ length: 3 }, () => leatherPool.splice(Math.floor(rand() * leatherPool.length), 1)[0]) as [string, string, string];
  const palette = [...PALETTE];
  for (let i = palette.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [palette[i], palette[j]] = [palette[j], palette[i]];
  }
  const color = new THREE.Color();
  const tints = palette.slice(0, TINT_GROUPS).map((hex) => {
    color.set(hex).offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.08);
    return `#${color.getHexString()}`;
  });
  return {
    floor: pick(rand, VARIANTS.floor),
    wall: pick(rand, VARIANTS.wall),
    ceiling: pick(rand, VARIANTS.ceiling),
    wood: pick(rand, VARIANTS.wood),
    leathers,
    parchment: pick(rand, VARIANTS.parchment),
    tints,
  };
}

/** Texture files of a gallery plan, in the order the provider loads them. */
export function planTextureUrls(plan: GalleryPlan): string[] {
  return [plan.floor, plan.wall, plan.ceiling, plan.wood, plan.parchment, plan.leathers[0], plan.leathers[1], plan.leathers[2]].map(textureUrl);
}

/** Every texture file a gallery may use: 30 small files, fetched once so new galleries appear instantly. */
export const ALL_TEXTURE_URLS: string[] = Array.from(new Set(Object.values(VARIANTS).flatMap((list) => list.map(textureUrl))));

/** Texture files a gallery with this seed will need (for fetching them ahead of time). */
export function galleryTextureUrls(seed: number): string[] {
  return planTextureUrls(planGallery(seed));
}

export interface LibraryTextures {
  parchment: THREE.Texture;
  wood: THREE.Texture;
  floor: THREE.Texture;
  wall: THREE.Texture;
  ceiling: THREE.Texture;
  /** Grey leather per grain, tinted per book by material.color. */
  leathers: THREE.Texture[];
  /** Leather with a darker title field and raised bands, per grain. */
  spines: THREE.Texture[];
  /** Gilt lines only (black elsewhere), used as emissiveMap so gold stays gold on any tint. */
  gilt: THREE.Texture;
  /** Fine horizontal stripes for the top / fore-edge of a page block. */
  pages: THREE.Texture;
}

export interface LibraryMaterials {
  plan: GalleryPlan;
  textures: LibraryTextures;
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  pages: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  lamp: THREE.MeshStandardMaterial;
  /** Cover (sides / top / back) and spine materials for each of the TINT_GROUPS binding colours. */
  books: { cover: THREE.MeshStandardMaterial; spine: THREE.MeshStandardMaterial }[];
  highlight: THREE.MeshBasicMaterial;
}

const MaterialsContext = createContext<LibraryMaterials | null>(null);

function prepare(source: THREE.Texture, repeatX: number, repeatY: number, anisotropy: number): THREE.Texture {
  const tex = source.clone();
  tex.wrapS = THREE.MirroredRepeatWrapping;
  tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeSpineTexture(leather: THREE.Texture, anisotropy: number): THREE.Texture {
  const W = 256;
  const H = 512;
  const [canvas, ctx] = createCanvas(W, H);
  const image = leather.image as CanvasImageSource | undefined;
  ctx.fillStyle = "#8c8c8c";
  ctx.fillRect(0, 0, W, H);
  if (image) {
    try {
      ctx.drawImage(image, 0, 0, W, H);
    } catch {
      /* keep the flat fill */
    }
  }
  // Slightly darker title field and raised bands, as on a hand-bound volume.
  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  ctx.fillRect(28, 96, W - 56, 128);
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  [58, 88, 244, 400, 440].forEach((y) => ctx.fillRect(0, y, W, 5));
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  [63, 93, 249, 405, 445].forEach((y) => ctx.fillRect(0, y, W, 2));
  return canvasTexture(canvas, anisotropy);
}

function makeGiltTexture(anisotropy: number): THREE.Texture {
  const W = 256;
  const H = 512;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#ffd27a";
  ctx.lineWidth = 3;
  const line = (y: number) => {
    ctx.beginPath();
    ctx.moveTo(22, y);
    ctx.lineTo(W - 22, y);
    ctx.stroke();
  };
  [48, 74, 234, 260, 420, 456].forEach(line);
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 104, W - 68, 112);
  ctx.lineWidth = 4;
  [136, 160, 184].forEach((y, i) => {
    ctx.beginPath();
    ctx.moveTo(W / 2 - (56 - i * 12), y);
    ctx.lineTo(W / 2 + (56 - i * 12), y);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(W / 2, 336);
  ctx.lineTo(W / 2 + 14, 352);
  ctx.lineTo(W / 2, 368);
  ctx.lineTo(W / 2 - 14, 352);
  ctx.closePath();
  ctx.stroke();
  return canvasTexture(canvas, anisotropy);
}

function makePagesTexture(anisotropy: number): THREE.Texture {
  const [canvas, ctx] = createCanvas(64, 256);
  ctx.fillStyle = "#e9dcc0";
  ctx.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 3) {
    ctx.fillStyle = y % 2 ? "rgba(90, 70, 40, 0.22)" : "rgba(255, 250, 235, 0.35)";
    ctx.fillRect(0, y, 64, 1);
  }
  const tex = canvasTexture(canvas, anisotropy);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  return tex;
}

/** Warm the very dark or very bright variants so every gallery keeps the same gloom. */
const SURFACE_TINT: Record<string, string> = {
  floor_marble: "#cfcfcf",
  floor_terracotta: "#9a8a80",
  wall_brick: "#8a7e78",
  ceiling_beams: "#b0a494",
  wood_ebony: "#f0e6d8",
  wood_mahogany: "#c9b8a4",
};

/**
 * The gold glow over what the pointer is on. One factory for every copy: the book's warm-up keeps this program compiled
 * (see DeskBookWarmUp), which only works while its material is made exactly like the gallery's.
 */
export function makeHighlightMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(GOLD_LIGHT),
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function LibraryMaterialsProvider({ seed = 0, children }: { seed?: number; children: ReactNode }) {
  const gl = useThree((s) => s.gl);
  const plan = useMemo(() => planGallery(seed), [seed]);
  const urls = useMemo(() => planTextureUrls(plan), [plan]);
  const loaded = useTexture(urls);
  const raw = useMemo(
    () => ({
      floor: loaded[0],
      wall: loaded[1],
      ceiling: loaded[2],
      wood: loaded[3],
      parchment: loaded[4],
      leather0: loaded[5],
      leather1: loaded[6],
      leather2: loaded[7],
    }),
    [loaded]
  );

  const value = useMemo<LibraryMaterials>(() => {
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const rawLeathers = [raw.leather0, raw.leather1, raw.leather2];
    const textures: LibraryTextures = {
      parchment: prepare(raw.parchment, 1, 1, aniso),
      wood: prepare(raw.wood, 1, 1, aniso),
      floor: prepare(raw.floor, 0.45, 0.45, aniso),
      wall: prepare(raw.wall, 0.4, 0.4, aniso),
      ceiling: prepare(raw.ceiling, 0.4, 0.4, aniso),
      leathers: rawLeathers.map((t) => prepare(t, 1, 1, aniso)),
      spines: rawLeathers.map((t) => makeSpineTexture(t, aniso)),
      gilt: makeGiltTexture(aniso),
      pages: makePagesTexture(aniso),
    };

    const woodShelf = prepare(raw.wood, 2.5, 0.25, aniso);
    woodShelf.rotation = Math.PI / 2;
    woodShelf.center.set(0.5, 0.5);
    const woodPanel = prepare(raw.wood, 1.2, 1, aniso);
    const woodTint = new THREE.Color(SURFACE_TINT[plan.wood] ?? "#d9c7ad");

    const books = plan.tints.map((tint, i) => {
      const grain = i % textures.leathers.length;
      return {
        cover: new THREE.MeshStandardMaterial({
          map: textures.leathers[grain],
          color: new THREE.Color(tint),
          roughness: 0.74,
          metalness: 0.02,
        }),
        spine: new THREE.MeshStandardMaterial({
          map: textures.spines[grain],
          color: new THREE.Color(tint),
          emissiveMap: textures.gilt,
          emissive: new THREE.Color("#ffd27a"),
          emissiveIntensity: 0.5,
          roughness: 0.62,
          metalness: 0.05,
        }),
      };
    });

    return {
      plan,
      textures,
      floor: new THREE.MeshStandardMaterial({
        map: textures.floor,
        color: new THREE.Color(SURFACE_TINT[plan.floor] ?? "#b9b2aa"),
        roughness: 0.82,
        metalness: 0.04,
      }),
      wall: new THREE.MeshStandardMaterial({
        map: textures.wall,
        color: new THREE.Color(SURFACE_TINT[plan.wall] ?? "#a89d90"),
        roughness: 0.95,
      }),
      ceiling: new THREE.MeshStandardMaterial({
        map: textures.ceiling,
        color: new THREE.Color(SURFACE_TINT[plan.ceiling] ?? "#97897b"),
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
      wood: new THREE.MeshStandardMaterial({
        map: woodPanel,
        color: woodTint,
        roughness: 0.7,
        metalness: 0.03,
      }),
      woodDark: new THREE.MeshStandardMaterial({
        map: woodShelf,
        color: woodTint.clone().multiplyScalar(0.87),
        roughness: 0.66,
        metalness: 0.03,
      }),
      pages: new THREE.MeshStandardMaterial({
        map: textures.pages,
        color: new THREE.Color("#efe4c8"),
        roughness: 0.92,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: new THREE.Color("#b08a3c"),
        roughness: 0.38,
        metalness: 0.55,
        emissive: new THREE.Color("#4a3610"),
        emissiveIntensity: 0.35,
      }),
      iron: new THREE.MeshStandardMaterial({
        color: new THREE.Color("#3b3430"),
        roughness: 0.55,
        metalness: 0.65,
      }),
      lamp: new THREE.MeshStandardMaterial({
        color: new THREE.Color("#fff3dc"),
        emissive: new THREE.Color(LAMP_COLOR),
        emissiveIntensity: 4,
        roughness: 0.3,
      }),
      books,
      highlight: makeHighlightMaterial(),
    };
  }, [raw, gl, plan]);

  useEffect(() => {
    return () => {
      const { textures, books, plan: _plan, ...rest } = value;
      void _plan;
      Object.values(rest).forEach((m) => {
        if (m instanceof THREE.Material) m.dispose();
      });
      books.forEach((b) => {
        b.cover.dispose();
        b.spine.dispose();
      });
      Object.values(textures).forEach((t) => {
        if (Array.isArray(t)) t.forEach((x) => x.dispose());
        else t.dispose();
      });
    };
  }, [value]);

  return <MaterialsContext.Provider value={value}>{children}</MaterialsContext.Provider>;
}

export function useLibraryMaterials(): LibraryMaterials {
  const ctx = useContext(MaterialsContext);
  if (!ctx) throw new Error("useLibraryMaterials must be used inside <LibraryMaterialsProvider>");
  return ctx;
}
