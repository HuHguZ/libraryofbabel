"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useTranslations } from "next-intl";
import { LIBRARY } from "@/lib/library";
import { useLibraryMaterials } from "./materials";
import { CASE, planBookcase, shelfPlankY, type BookPlacement, type BookRef } from "./bookcasePlan";
import { canvasTexture, createCanvas, loadSerifFont, makePlaqueTexture } from "./textTexture";
import { setCanvasCursor } from "./cursor";

export { CASE, shelfPlankY, type BookRef } from "./bookcasePlan";

export interface BookcaseProps {
  wall: number;
  /** Seed for the deterministic binding colours of this gallery. */
  seed: number;
  position?: [number, number, number];
  rotationY?: number;
  /** Render this shelf with individual, titled volumes (used by the shelf close-up). */
  detail?: { shelf: number; titles: string[] };
  /** When set, volumes of the other shelves neither highlight nor open (their planks still do). */
  focusShelf?: number;
  /** A volume taken off its shelf: drawn nowhere (its instance is zero-scaled, no DetailedBook either). */
  hidden?: { shelf: number; volume: number };
  interactive?: boolean;
  onHoverBook?: (book: BookRef | null) => void;
  onClickBook?: (book: BookRef) => void;
  onHoverShelf?: (shelf: number | null) => void;
  onClickShelf?: (shelf: number) => void;
}

export const BOOK_GEOMETRY = new THREE.BoxGeometry(CASE.bookW, CASE.bookH, CASE.bookD);
const HIGHLIGHT_GEOMETRY = new THREE.BoxGeometry(CASE.bookW + 0.014, CASE.bookH + 0.014, CASE.bookD + 0.02);
const SHELF_HIGHLIGHT_GEOMETRY = new THREE.BoxGeometry(CASE.usableWidth + 0.02, CASE.shelfThickness + 0.02, CASE.shelfDepth + 0.02);
/** How far a volume under the pointer comes out of its row (m); a titled one of the close-up comes further. */
export const PULL_OUT = 0.06;
export const TITLED_PULL_OUT = PULL_OUT * 1.4;
const dummy = new THREE.Object3D();

/** A throwaway 1×1 texture: filling a texture slot is what shapes a program, not what the texture shows. */
const KEEP_WARM_TEXTURE = canvasTexture(createCanvas(1, 1)[0]);
/**
 * Same shape as the per-title spine clone `DetailedBook` makes below (map, color, emissiveMap, emissive,
 * roughness, metalness) but never disposed. Rendered once, at zero scale, by `DeskBookWarmUp` (not once per
 * bookcase — the world mounts up to 30 of these) so its program is compiled once and never evicted: opening
 * a shelf close-up then reuses it instead of stalling on a fresh compile (spec 3.5 — program count stays
 * constant across transitions).
 */
export const KEEP_WARM_SPINE = new THREE.MeshStandardMaterial({
  map: KEEP_WARM_TEXTURE,
  emissiveMap: KEEP_WARM_TEXTURE,
  emissive: new THREE.Color("#ffd27a"),
  emissiveIntensity: 0.5,
  roughness: 0.62,
  metalness: 0.05,
});

function useSerifFont(): string | null {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadSerifFont().then((f) => {
      if (alive) setFamily(f);
    });
    return () => {
      alive = false;
    };
  }, []);
  return family;
}

/** Gilt lines plus a title, drawn along the spine; used as emissive map so the gold stays gold. */
export function makeTitleGilt(title: string, family: string): THREE.CanvasTexture {
  const W = 256;
  const H = 512;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#ffd27a";
  ctx.lineWidth = 3;
  [40, 62, 450, 472].forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(22, y);
    ctx.lineTo(W - 22, y);
    ctx.stroke();
  });
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#ffd27a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 34;
  ctx.font = `600 ${size}px ${family}`;
  const maxWidth = 360;
  while (ctx.measureText(title).width > maxWidth && size > 16) {
    size -= 2;
    ctx.font = `600 ${size}px ${family}`;
  }
  ctx.fillText(title, 0, 0, maxWidth);
  ctx.restore();
  return canvasTexture(canvas);
}

export default function Bookcase({
  wall,
  seed,
  position = [0, 0, 0],
  rotationY = 0,
  detail,
  focusShelf,
  hidden,
  interactive = true,
  onHoverBook,
  onClickBook,
  onHoverShelf,
  onClickShelf,
}: BookcaseProps) {
  const materials = useLibraryMaterials();
  const gl = useThree((s) => s.gl);
  const family = useSerifFont();
  const book = useTranslations("Book");
  const common = useTranslations("Common");
  const wallLabel = book("wallPlaque", { n: wall });

  const callbacks = useRef({ onHoverBook, onClickBook, onHoverShelf, onClickShelf });
  useLayoutEffect(() => {
    callbacks.current = { onHoverBook, onClickBook, onHoverShelf, onClickShelf };
  });

  /* ── Deterministic binding colours; runs of the same tint read as multi-volume series ── */
  const { groups, placements } = useMemo(() => planBookcase(seed, wall, detail?.shelf), [seed, wall, detail?.shelf]);

  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const highlightRef = useRef<THREE.Mesh>(null);
  const shelfHighlightRef = useRef<THREE.Mesh>(null);
  const hovered = useRef<{ group: number; index: number } | null>(null);

  const hiddenShelf = hidden?.shelf;
  const hiddenVolume = hidden?.volume;
  // A stable identity (changing only with the shelf/volume that's off its shelf) keeps the effect below from
  // rewriting every instance's matrix on every unrelated re-render.
  const writeInstance = useCallback(
    (mesh: THREE.InstancedMesh, book: BookPlacement, index: number, pulled: boolean) => {
      const taken = book.shelf === hiddenShelf && book.volume === hiddenVolume;
      dummy.position.set(book.x, book.y, book.z + (pulled ? PULL_OUT : 0));
      dummy.scale.set(taken ? 0 : 1, taken ? 0 : book.scaleY, taken ? 0 : 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    },
    [hiddenShelf, hiddenVolume]
  );

  useLayoutEffect(() => {
    groups.forEach((group, gi) => {
      const mesh = meshRefs.current[gi];
      if (!mesh) return;
      group.books.forEach((book, i) => writeInstance(mesh, book, i, false));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    hovered.current = null;
    if (highlightRef.current) highlightRef.current.visible = false;
  }, [groups, writeInstance]);

  const clearHover = useCallback(() => {
    const h = hovered.current;
    if (h) {
      const mesh = meshRefs.current[h.group];
      if (mesh) {
        writeInstance(mesh, groups[h.group].books[h.index], h.index, false);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    hovered.current = null;
    if (highlightRef.current) highlightRef.current.visible = false;
    setCanvasCursor(gl.domElement, false);
    callbacks.current.onHoverBook?.(null);
  }, [groups, writeInstance, gl]);

  const setHover = (gi: number, index: number) => {
    const h = hovered.current;
    if (h && h.group === gi && h.index === index) return;
    if (h) {
      const prevMesh = meshRefs.current[h.group];
      if (prevMesh) {
        writeInstance(prevMesh, groups[h.group].books[h.index], h.index, false);
        prevMesh.instanceMatrix.needsUpdate = true;
      }
    }
    const mesh = meshRefs.current[gi];
    const book = groups[gi].books[index];
    if (!mesh || !book) return;
    writeInstance(mesh, book, index, true);
    mesh.instanceMatrix.needsUpdate = true;
    hovered.current = { group: gi, index };
    if (highlightRef.current) {
      highlightRef.current.position.set(book.x, book.y, book.z + PULL_OUT);
      highlightRef.current.scale.set(1, book.scaleY, 1);
      highlightRef.current.visible = true;
    }
    setCanvasCursor(gl.domElement, true);
    callbacks.current.onHoverBook?.({ wall, shelf: book.shelf, volume: book.volume });
  };

  // Pointer handlers vanish with interactivity (a flight taking over, say), so a volume already pulled
  // out under the cursor would otherwise stay pulled out until something else rewrites the instances.
  // Every bookcase of every cell runs this effect; clearing unconditionally would wipe the cursor and the
  // hover of whichever bookcase actually owns one, so only a bookcase with a live hover of its own clears it.
  useEffect(() => {
    if (!interactive && hovered.current) clearHover();
  }, [interactive, clearHover]);

  useEffect(() => {
    return () => {
      setCanvasCursor(gl.domElement, false);
    };
  }, [gl]);

  /* ── Plaques ── */
  const plaques = useMemo(() => {
    if (!family) return null;
    const wallPlaque = makePlaqueTexture(wallLabel, family, { width: 640, height: 96, fontSize: 52, letterSpacing: 6 });
    const shelfPlaques = Array.from({ length: LIBRARY.shelves }, (_, i) =>
      makePlaqueTexture(`${i + 1}`, family, { width: 160, height: 96, fontSize: 60, letterSpacing: 0 })
    );
    return { wallPlaque, shelfPlaques };
  }, [family, wallLabel]);

  useEffect(() => {
    return () => {
      plaques?.wallPlaque.dispose();
      plaques?.shelfPlaques.forEach((t) => t.dispose());
    };
  }, [plaques]);

  const plaqueMaterials = useMemo(() => {
    if (!plaques) return null;
    const make = (map: THREE.Texture) =>
      new THREE.MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.5, emissive: new THREE.Color("#3a2a10"), emissiveIntensity: 0.4 });
    return { wall: make(plaques.wallPlaque), shelves: plaques.shelfPlaques.map(make) };
  }, [plaques]);

  useEffect(() => {
    return () => {
      plaqueMaterials?.wall.dispose();
      plaqueMaterials?.shelves.forEach((m) => m.dispose());
    };
  }, [plaqueMaterials]);

  /* ── Detailed (titled) volumes for the close-up shelf; the one taken off it (if any) is left out ── */
  const detailBooks = useMemo(() => {
    if (!detail || !family) return null;
    const books: { volume: number; tint: number; x: number; y: number; z: number; scaleY: number; spine: THREE.MeshStandardMaterial; gilt: THREE.CanvasTexture }[] = [];
    detail.titles.forEach((title, i) => {
      const volume = i + 1;
      if (detail.shelf === hiddenShelf && volume === hiddenVolume) return;
      // The volume's own placement: the same binding and height as on the other shelves and in flight.
      const { tint, x, y, z, scaleY } = placements.find((b) => b.shelf === detail.shelf && b.volume === volume)!;
      const gilt = makeTitleGilt(title.trim() || common("volumeN", { n: volume }), family);
      const spine = materials.books[tint].spine.clone();
      spine.emissiveMap = gilt;
      spine.emissiveIntensity = 0.65;
      spine.needsUpdate = true;
      books.push({ volume, tint, x, y, z, scaleY, spine, gilt });
    });
    return books;
  }, [detail, family, placements, materials, common, hiddenShelf, hiddenVolume]);

  useEffect(() => {
    return () => {
      detailBooks?.forEach((b) => {
        b.spine.dispose();
        b.gilt.dispose();
      });
    };
  }, [detailBooks]);

  const bookMaterials = useMemo(
    () =>
      materials.books.map((b) => [b.cover, b.cover, materials.pages, materials.pages, b.spine, b.cover] as THREE.Material[]),
    [materials]
  );

  const shelfYs = useMemo(() => Array.from({ length: LIBRARY.shelves }, (_, i) => shelfPlankY(i + 1)), []);
  const sideX = CASE.width / 2 - 0.03;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Back panel, sides, cornice and plinth */}
      <mesh position={[0, CASE.height / 2, -0.02]} material={materials.wood}>
        <boxGeometry args={[CASE.width, CASE.height, 0.04]} />
      </mesh>
      <mesh position={[-sideX, CASE.height / 2, CASE.depth / 2]} material={materials.wood}>
        <boxGeometry args={[0.06, CASE.height, CASE.depth]} />
      </mesh>
      <mesh position={[sideX, CASE.height / 2, CASE.depth / 2]} material={materials.wood}>
        <boxGeometry args={[0.06, CASE.height, CASE.depth]} />
      </mesh>
      <mesh position={[0, CASE.height - 0.05, CASE.depth / 2 + 0.02]} material={materials.woodDark}>
        <boxGeometry args={[CASE.width, 0.1, CASE.depth + 0.04]} />
      </mesh>
      <mesh position={[0, 0.07, CASE.depth / 2]} material={materials.woodDark}>
        <boxGeometry args={[CASE.width - 0.12, 0.14, CASE.depth]} />
      </mesh>

      {/* Wall plaque on the cornice */}
      {plaqueMaterials && (
        <mesh position={[0, CASE.height - 0.05, CASE.depth + 0.045]} material={plaqueMaterials.wall}>
          <planeGeometry args={[0.6, 0.09]} />
        </mesh>
      )}

      {/* Shelves */}
      {shelfYs.map((y, i) => {
        const shelf = i + 1;
        return (
          <group key={shelf}>
            <mesh
              position={[0, y, CASE.shelfDepth / 2]}
              material={materials.woodDark}
              onPointerOver={
                interactive
                  ? (e: ThreeEvent<PointerEvent>) => {
                      e.stopPropagation();
                      if (shelfHighlightRef.current) {
                        shelfHighlightRef.current.position.set(0, y, CASE.shelfDepth / 2);
                        shelfHighlightRef.current.visible = true;
                      }
                      setCanvasCursor(gl.domElement, true);
                      callbacks.current.onHoverShelf?.(shelf);
                    }
                  : undefined
              }
              onPointerOut={
                interactive
                  ? () => {
                      if (shelfHighlightRef.current) shelfHighlightRef.current.visible = false;
                      setCanvasCursor(gl.domElement, false);
                      callbacks.current.onHoverShelf?.(null);
                    }
                  : undefined
              }
              onClick={
                interactive
                  ? (e: ThreeEvent<MouseEvent>) => {
                      e.stopPropagation();
                      callbacks.current.onClickShelf?.(shelf);
                    }
                  : undefined
              }
            >
              <boxGeometry args={[CASE.width - 0.12, CASE.shelfThickness, CASE.shelfDepth]} />
            </mesh>
            {plaqueMaterials && (
              <mesh position={[0, y, CASE.shelfDepth + 0.002]} material={plaqueMaterials.shelves[i]}>
                <planeGeometry args={[0.07, 0.042]} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Volumes, instanced per binding colour */}
      {groups.map((group, gi) => (
        <instancedMesh
          key={group.tint}
          ref={(m) => {
            meshRefs.current[gi] = m;
          }}
          args={[BOOK_GEOMETRY, bookMaterials[group.tint], group.books.length]}
          onPointerMove={
            interactive
              ? (e: ThreeEvent<PointerEvent>) => {
                  e.stopPropagation();
                  if (e.instanceId === undefined) return;
                  if (focusShelf && group.books[e.instanceId]?.shelf !== focusShelf) {
                    clearHover();
                    return;
                  }
                  setHover(gi, e.instanceId);
                }
              : undefined
          }
          onPointerOut={interactive ? () => clearHover() : undefined}
          onClick={
            interactive
              ? (e: ThreeEvent<MouseEvent>) => {
                  e.stopPropagation();
                  if (e.instanceId === undefined) return;
                  const book = group.books[e.instanceId];
                  if (!book || (focusShelf && book.shelf !== focusShelf)) return;
                  callbacks.current.onClickBook?.({ wall, shelf: book.shelf, volume: book.volume });
                }
              : undefined
          }
        />
      ))}

      {/* Titled volumes of the close-up shelf */}
      {detailBooks?.map((b) => (
        <DetailedBook
          key={b.volume}
          book={b}
          materials={[materials.books[b.tint].cover, materials.books[b.tint].cover, materials.pages, materials.pages, b.spine, materials.books[b.tint].cover]}
          interactive={interactive}
          onHover={(on) => {
            setCanvasCursor(gl.domElement, on);
            callbacks.current.onHoverBook?.(on ? { wall, shelf: detail!.shelf, volume: b.volume } : null);
          }}
          onClick={() => callbacks.current.onClickBook?.({ wall, shelf: detail!.shelf, volume: b.volume })}
        />
      ))}

      {/* Hover highlights */}
      <mesh ref={highlightRef} geometry={HIGHLIGHT_GEOMETRY} material={materials.highlight} visible={false} />
      <mesh ref={shelfHighlightRef} geometry={SHELF_HIGHLIGHT_GEOMETRY} material={materials.highlight} visible={false} />
    </group>
  );
}

function DetailedBook({
  book,
  materials,
  interactive,
  onHover,
  onClick,
}: {
  book: { x: number; y: number; z: number; scaleY: number };
  materials: THREE.Material[];
  interactive: boolean;
  onHover: (on: boolean) => void;
  onClick: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const target = book.z + (hovered ? TITLED_PULL_OUT : 0);

  useEffect(() => {
    if (ref.current) ref.current.position.z = target;
  }, [target]);

  return (
    <group>
      <mesh
        ref={ref}
        geometry={BOOK_GEOMETRY}
        material={materials}
        position={[book.x, book.y, book.z]}
        scale={[1, book.scaleY, 1]}
        onPointerOver={
          interactive
            ? (e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                setHovered(true);
                onHover(true);
              }
            : undefined
        }
        onPointerOut={
          interactive
            ? () => {
                setHovered(false);
                onHover(false);
              }
            : undefined
        }
        onClick={
          interactive
            ? (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onClick();
              }
            : undefined
        }
      />
      {hovered && (
        <mesh geometry={HIGHLIGHT_GEOMETRY} position={[book.x, book.y, target]} scale={[1, book.scaleY, 1]}>
          <meshBasicMaterial color="#f0d890" transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
    </group>
  );
}
