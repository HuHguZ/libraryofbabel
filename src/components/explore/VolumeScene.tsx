"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useTranslations } from "next-intl";
import { LIBRARY } from "@/lib/library";
import { LAMP_COLOR, useLibraryMaterials } from "./materials";
import { loadSerifFont } from "./textTexture";
import { INDEX, INDEX_CANVAS, PAGE, indexCellCenter, indexCellFromUv, makeIndexPage, makeTitlePage, type TitlePageText } from "./bookPages";
import { setCanvasCursor } from "./cursor";

export interface VolumeSceneProps {
  title: string;
  wall: number;
  shelf: number;
  volume: number;
  onHoverPage?: (page: number | null) => void;
  onClickPage?: (page: number) => void;
  onInteract?: () => void;
}

const BLOCK_H = 0.12;

function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.set(0.35, 2.3, 2.15);
    camera.fov = 44;
    camera.near = 0.05;
    camera.far = 40;
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

/** The reading table with its lamp, shared by the open volume and the reader. */
export function ReadingTable() {
  const materials = useLibraryMaterials();
  return (
    <group>
      <hemisphereLight args={["#4a4258", "#141009", 0.6]} />
      <pointLight position={[1.4, 2.3, 1.2]} color={LAMP_COLOR} intensity={14} distance={12} decay={2} />
      <pointLight position={[-1.6, 1.6, -1.0]} color="#8a8fb8" intensity={2.5} distance={9} decay={2} />
      <mesh position={[0, -0.06, 0]} material={materials.woodDark}>
        <boxGeometry args={[4.2, 0.12, 3.2]} />
      </mesh>
      <group position={[1.75, 0, -0.9]}>
        <mesh position={[0, 0.02, 0]} material={materials.brass}>
          <cylinderGeometry args={[0.12, 0.16, 0.04, 16]} />
        </mesh>
        <mesh position={[0, 0.5, 0]} material={materials.brass}>
          <cylinderGeometry args={[0.014, 0.014, 0.96, 8]} />
        </mesh>
        <mesh position={[0, 1.02, 0]} material={materials.lamp}>
          <sphereGeometry args={[0.11, 20, 16]} />
        </mesh>
      </group>
    </group>
  );
}

/** Silk bookmark lying in the gutter of the left page and hanging off the bottom edge. */
export function Bookmark({ y }: { y: number }) {
  return (
    <mesh position={[-0.1, y, 0.42]} rotation={[-Math.PI / 2, 0, 0.03]}>
      <planeGeometry args={[0.045, 1.5]} />
      <meshStandardMaterial color="#7a1f1f" roughness={0.7} side={THREE.DoubleSide} />
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

export default function VolumeScene({ title, wall, shelf, volume, onHoverPage, onClickPage, onInteract }: VolumeSceneProps) {
  const titleText = useTitlePageText(title, wall, shelf, volume);
  const book = useTranslations("Book");
  const indexText = useMemo(
    () => ({ title: book("indexTitle"), subtitle: book("indexSubtitle", { pages: LIBRARY.pages, chars: LIBRARY.pageLength }) }),
    [book]
  );
  const materials = useLibraryMaterials();
  const gl = useThree((s) => s.gl);
  const [family, setFamily] = useState<string | null>(null);
  const highlightRef = useRef<THREE.Mesh>(null);
  const hovered = useRef<number | null>(null);
  const callbacks = useRef({ onHoverPage, onClickPage, onInteract });
  useLayoutEffect(() => {
    callbacks.current = { onHoverPage, onClickPage, onInteract };
  });

  useEffect(() => {
    let alive = true;
    loadSerifFont().then((f) => {
      if (alive) setFamily(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  const pages = useMemo(() => {
    if (!family) return null;
    return {
      left: makeTitlePage(family, materials.textures.parchment, titleText),
      right: makeIndexPage(family, materials.textures.parchment, indexText),
    };
  }, [family, materials, titleText, indexText]);

  useEffect(() => {
    return () => {
      pages?.left.dispose();
      pages?.right.dispose();
    };
  }, [pages]);

  const pageMaterials = useMemo(() => {
    const make = (map: THREE.Texture | null) =>
      new THREE.MeshStandardMaterial({ map: map ?? materials.textures.parchment, color: new THREE.Color("#f2e8d2"), roughness: 0.9 });
    return { left: make(pages?.left ?? null), right: make(pages?.right ?? null) };
  }, [pages, materials]);

  useEffect(() => {
    return () => {
      pageMaterials.left.dispose();
      pageMaterials.right.dispose();
    };
  }, [pageMaterials]);

  const leftBlock = useMemo(
    () => [materials.pages, materials.pages, pageMaterials.left, materials.pages, materials.pages, materials.pages] as THREE.Material[],
    [materials, pageMaterials]
  );
  const rightBlock = useMemo(
    () => [materials.pages, materials.pages, pageMaterials.right, materials.pages, materials.pages, materials.pages] as THREE.Material[],
    [materials, pageMaterials]
  );

  const setHovered = (index: number | null) => {
    if (hovered.current === index) return;
    hovered.current = index;
    const h = highlightRef.current;
    if (h) {
      if (index === null) {
        h.visible = false;
      } else {
        const c = indexCellCenter(index);
        h.position.set(-PAGE.w / 2 + c.x * PAGE.w, BLOCK_H / 2 + 0.003, -PAGE.d / 2 + c.y * PAGE.d);
        h.visible = true;
      }
    }
    setCanvasCursor(gl.domElement, index !== null);
    callbacks.current.onHoverPage?.(index === null ? null : index + 1);
  };

  useEffect(() => () => setCanvasCursor(gl.domElement, false), [gl]);

  const cover = materials.books[0].cover;

  return (
    <group>
      <CameraRig />
      <OrbitControls
        makeDefault
        target={[0.15, 0.12, 0]}
        minDistance={1.3}
        maxDistance={4.2}
        minPolarAngle={0.25}
        maxPolarAngle={1.25}
        minAzimuthAngle={-0.95}
        maxAzimuthAngle={0.95}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        onStart={() => callbacks.current.onInteract?.()}
      />
      <ReadingTable />

      {/* The open volume */}
      <mesh position={[0, 0.025, 0]} material={cover}>
        <boxGeometry args={[3.02, 0.05, 2.14]} />
      </mesh>
      <mesh position={[0, BLOCK_H / 2 + 0.05, 0]} material={cover}>
        <boxGeometry args={[0.07, BLOCK_H + 0.01, 2.1]} />
      </mesh>
      <mesh position={[-PAGE.w / 2 - 0.035, BLOCK_H / 2 + 0.05, 0]} material={leftBlock}>
        <boxGeometry args={[PAGE.w, BLOCK_H, PAGE.d]} />
      </mesh>
      <group position={[PAGE.w / 2 + 0.035, BLOCK_H / 2 + 0.05, 0]}>
        <mesh
          material={rightBlock}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            if (!e.uv || e.face?.normal.y !== 1) {
              setHovered(null);
              return;
            }
            setHovered(indexCellFromUv(e.uv));
          }}
          onPointerOut={() => setHovered(null)}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (!e.uv) return;
            const index = indexCellFromUv(e.uv);
            if (index !== null) callbacks.current.onClickPage?.(index + 1);
          }}
        >
          <boxGeometry args={[PAGE.w, BLOCK_H, PAGE.d]} />
        </mesh>
        <mesh ref={highlightRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} material={materials.highlight}>
          <planeGeometry args={[(INDEX.cellW / INDEX_CANVAS.w) * PAGE.w, (INDEX.cellH / INDEX_CANVAS.h) * PAGE.d]} />
        </mesh>
      </group>
      <Bookmark y={BLOCK_H + 0.053} />
    </group>
  );
}
