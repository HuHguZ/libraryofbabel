"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { LIBRARY } from "@/lib/library";
import { createRandom } from "@/lib/hex";
import { TINT_GROUPS, useLibraryMaterials } from "./materials";
import { canvasTexture, createCanvas, loadSerifFont, makePlaqueTexture } from "./textTexture";
import { setCanvasCursor } from "./cursor";

/** Dimensions of one wall of shelves (metres). Local +z faces into the room, the back panel sits at z = 0. */
export const CASE = {
  width: 3.7,
  height: 3.36,
  depth: 0.32,
  shelfDepth: 0.3,
  shelfThickness: 0.035,
  usableWidth: 3.5,
  firstShelfY: 0.2,
  shelfGap: 0.44,
  bookW: 0.1,
  bookH: 0.32,
  bookD: 0.24,
} as const;

export interface BookRef {
  wall: number;
  shelf: number;
  volume: number;
}

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
  interactive?: boolean;
  onHoverBook?: (book: BookRef | null) => void;
  onClickBook?: (book: BookRef) => void;
  onHoverShelf?: (shelf: number | null) => void;
  onClickShelf?: (shelf: number) => void;
}

interface BookPlacement {
  shelf: number;
  volume: number;
  x: number;
  y: number;
  z: number;
  scaleY: number;
}

interface TintGroup {
  tint: number;
  books: BookPlacement[];
}

const BOOK_GEOMETRY = new THREE.BoxGeometry(CASE.bookW, CASE.bookH, CASE.bookD);
const HIGHLIGHT_GEOMETRY = new THREE.BoxGeometry(CASE.bookW + 0.014, CASE.bookH + 0.014, CASE.bookD + 0.02);
const SHELF_HIGHLIGHT_GEOMETRY = new THREE.BoxGeometry(CASE.usableWidth + 0.02, CASE.shelfThickness + 0.02, CASE.shelfDepth + 0.02);
const PULL_OUT = 0.06;
const dummy = new THREE.Object3D();

/** Y of the plank of shelf `s` (1 = top, 7 = bottom). */
export function shelfPlankY(shelf: number): number {
  return CASE.firstShelfY + (LIBRARY.shelves - shelf) * CASE.shelfGap;
}

export function bookSpacing(): number {
  return CASE.usableWidth / LIBRARY.volumes;
}

/** Local position of a volume on its shelf. */
export function bookLocalPosition(shelf: number, volume: number, scaleY = 1): [number, number, number] {
  const spacing = bookSpacing();
  const x = -CASE.usableWidth / 2 + spacing * (volume - 1) + spacing / 2;
  const y = shelfPlankY(shelf) + CASE.shelfThickness / 2 + (CASE.bookH * scaleY) / 2;
  const z = 0.02 + CASE.bookD / 2;
  return [x, y, z];
}

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
function makeTitleGilt(title: string, family: string): THREE.CanvasTexture {
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
  interactive = true,
  onHoverBook,
  onClickBook,
  onHoverShelf,
  onClickShelf,
}: BookcaseProps) {
  const materials = useLibraryMaterials();
  const gl = useThree((s) => s.gl);
  const family = useSerifFont();

  const callbacks = useRef({ onHoverBook, onClickBook, onHoverShelf, onClickShelf });
  useLayoutEffect(() => {
    callbacks.current = { onHoverBook, onClickBook, onHoverShelf, onClickShelf };
  });

  /* ── Deterministic binding colours; runs of the same tint read as multi-volume series ── */
  const { groups, tintOf } = useMemo(() => {
    const rand = createRandom(seed * 7919 + wall * 104729);
    const groupsByTint: TintGroup[] = Array.from({ length: TINT_GROUPS }, (_, tint) => ({ tint, books: [] }));
    const tintOf = new Map<string, number>();
    for (let shelf = 1; shelf <= LIBRARY.shelves; shelf++) {
      let tint = Math.floor(rand() * TINT_GROUPS);
      for (let volume = 1; volume <= LIBRARY.volumes; volume++) {
        if (rand() > 0.72) tint = Math.floor(rand() * TINT_GROUPS);
        const scaleY = 0.97 + rand() * 0.06;
        tintOf.set(`${shelf}-${volume}`, tint);
        if (detail && detail.shelf === shelf) continue;
        const [x, y, z] = bookLocalPosition(shelf, volume, scaleY);
        groupsByTint[tint].books.push({ shelf, volume, x, y, z, scaleY });
      }
    }
    return { groups: groupsByTint.filter((g) => g.books.length > 0), tintOf };
  }, [seed, wall, detail]);

  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const highlightRef = useRef<THREE.Mesh>(null);
  const shelfHighlightRef = useRef<THREE.Mesh>(null);
  const hovered = useRef<{ group: number; index: number } | null>(null);

  const writeInstance = (mesh: THREE.InstancedMesh, book: BookPlacement, index: number, pulled: boolean) => {
    dummy.position.set(book.x, book.y, book.z + (pulled ? PULL_OUT : 0));
    dummy.scale.set(1, book.scaleY, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };

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
  }, [groups]);

  const clearHover = () => {
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
  };

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

  useEffect(() => {
    return () => {
      setCanvasCursor(gl.domElement, false);
    };
  }, [gl]);

  /* ── Plaques ── */
  const plaques = useMemo(() => {
    if (!family) return null;
    const wallPlaque = makePlaqueTexture(`СТЕНА ${wall}`, family, { width: 640, height: 96, fontSize: 52, letterSpacing: 6 });
    const shelfPlaques = Array.from({ length: LIBRARY.shelves }, (_, i) =>
      makePlaqueTexture(`${i + 1}`, family, { width: 160, height: 96, fontSize: 60, letterSpacing: 0 })
    );
    return { wallPlaque, shelfPlaques };
  }, [family, wall]);

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

  /* ── Detailed (titled) volumes for the close-up shelf ── */
  const detailBooks = useMemo(() => {
    if (!detail || !family) return null;
    const rand = createRandom(seed * 31 + wall * 17 + detail.shelf * 101);
    return detail.titles.map((title, i) => {
      const volume = i + 1;
      const tint = tintOf.get(`${detail.shelf}-${volume}`) ?? 0;
      const scaleY = 0.97 + rand() * 0.06;
      const [x, y, z] = bookLocalPosition(detail.shelf, volume, scaleY);
      const gilt = makeTitleGilt(title.trim() || `Том ${volume}`, family);
      const spine = materials.books[tint].spine.clone();
      spine.emissiveMap = gilt;
      spine.emissiveIntensity = 0.65;
      spine.needsUpdate = true;
      return { volume, tint, x, y, z, scaleY, spine, gilt };
    });
  }, [detail, family, seed, wall, tintOf, materials]);

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
  const target = book.z + (hovered ? PULL_OUT * 1.4 : 0);

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
