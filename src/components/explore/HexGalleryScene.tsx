"use client";

import { Fragment, Suspense, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LIBRARY } from "@/lib/library";
import { cellHex, hashString } from "@/lib/hex";
import Bookcase, { CASE, shelfPlankY, type BookRef } from "./Bookcase";
import GalleryControls, { type GalleryControlsHandle } from "./GalleryControls";
import {
  DOOR_INDEX,
  ROOM,
  STAIR,
  cellAt,
  constrainWalk,
  facingCenterRotation,
  facingSide,
  galleryCenter,
  galleryRotation,
  hexagonShape,
  sideAngle,
  stairRampHeight,
  trackLevel,
  type GallerySide,
} from "./geometry";
import { ALL_TEXTURE_URLS, LAMP_COLOR, LibraryMaterialsProvider, useLibraryMaterials } from "./materials";
import ReadingDesk from "./stage/ReadingDesk";
import { BOOKCASE_RADIUS, deskLampLocal, galleryToWorld } from "./stage/deskFrame";
import type { WalkPose } from "./stage/poses";

export interface WorldPlace {
  level: number;
  side: GallerySide;
  /** Address of the gallery the visitor is in (or was in last, while crossing the vestibule). */
  hex: string;
}

/** Titled volumes on one shelf, drawn one by one with that shelf in focus. */
export interface ShelfDetail {
  wall: number;
  shelf: number;
  titles: string[];
}

/** A volume that is off its shelf, and the gallery it belongs to. */
export interface HiddenVolume {
  level: number;
  side: GallerySide;
  wall: number;
  shelf: number;
  volume: number;
}

export interface GalleryWorldProps {
  /** Address of the gallery the world is built around (level 0, side "a"); every other gallery derives from it. */
  worldHex: string;
  /** Where the eye starts; read when the world mounts. */
  initialPose: WalkPose;
  /** The gallery that eye is in (level 0, side "a" when omitted); read when the world mounts. */
  initialPlace?: { level: number; side: GallerySide };
  controlsRef?: Ref<GalleryControlsHandle>;
  /**
   * "walk": the visitor walks and the world follows them from gallery to gallery. "shelf": the current gallery
   * answers the pointer but nobody walks. "none": nothing answers.
   */
  interactive: "walk" | "shelf" | "none";
  /** Titled volumes on a shelf of the current gallery. */
  detail: ShelfDetail | null;
  /** A volume that is off its shelf, handed down to its gallery. */
  hidden: HiddenVolume | null;
  /** The shelf of the current gallery the spot light falls on; the spot is dark while null. */
  shelfSpot: { wall: number; shelf: number } | null;
  /** The desk lamp lit in the current gallery, and how brightly; the lamp is dark while null. */
  deskLamp: { wall: number; intensity: number } | null;
  /** Takes the desk lamp's light, which a flight brightens and dims frame by frame without re-rendering the world. */
  deskLightRef?: Ref<THREE.PointLight>;
  /** Fires once, when the gallery the visitor starts in has loaded. */
  onCurrentCellReady?: () => void;
  onHoverBook?: (book: BookRef | null) => void;
  onClickBook?: (book: BookRef) => void;
  onHoverShelf?: (wall: number, shelf: number | null) => void;
  onClickShelf?: (wall: number, shelf: number) => void;
  /** Side (0..5) of the current gallery the visitor is facing; 5 is the doorway. */
  onFacingSide?: (side: number) => void;
  /** Fired when the visitor enters another gallery (through the vestibule, or up / down the stair). */
  onPlace?: (place: WorldPlace) => void;
  onInteract?: () => void;
  onLockChange?: (locked: boolean) => void;
}

const FLOOR_SHAPE = hexagonShape(ROOM.radius, ROOM.shaftRadius);
const FLOOR_GEOMETRY = new THREE.ShapeGeometry(FLOOR_SHAPE);
const LEVEL_H = ROOM.level;

/** Bare stone lining of the shafts and stair wells, the same in every gallery. */
const STONE = new THREE.MeshStandardMaterial({ color: new THREE.Color("#3a3430"), roughness: 0.96, side: THREE.BackSide });

/** Levels (relative to the visitor's) whose stair is rendered; the rest is lost in the dark. */
const STAIR_LEVELS = [-3, -2, -1, 0, 1, 2, 3];

const VESTIBULE_FLOOR = (() => {
  const halfW = ROOM.vestibuleWidth / 2;
  const depth = ROOM.vestibuleDepth;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.lineTo(halfW, 0);
  shape.lineTo(halfW, depth);
  shape.lineTo(-halfW, depth);
  shape.closePath();
  const well = new THREE.Path();
  well.absarc(STAIR.x, -STAIR.z, STAIR.wellRadius, 0, Math.PI * 2, false);
  shape.holes.push(well);
  return new THREE.ShapeGeometry(shape, 32);
})();

const TREAD_OUTER = STAIR.wellRadius - 0.03;
const TREAD_THICKNESS = 0.045;
const RAIL_HEIGHT = 0.92;
/**
 * The three treads around each landing (the one flush with the floor and its neighbours) are where
 * the visitor steps on and off, so the handrail and its balusters run over treads 1..13 only.
 */
const RAIL_FIRST_TREAD = 1;
const RAIL_LAST_TREAD = 13;
const RAIL_FROM = RAIL_FIRST_TREAD * STAIR.arc + 0.1;
const RAIL_TO = (RAIL_LAST_TREAD + 1) * STAIR.arc - 0.1;
const RAIL_RADIUS = TREAD_OUTER - 0.03;

/** Top of tread i of the level whose floor is at y = 0. */
const treadTop = (i: number) => (i + 1) * STAIR.rise;

/** One wedge-shaped tread with its riser, the top surface at y = 0, covering angles [0, arc]. */
const TREAD_GEOMETRY = (() => {
  const r0 = STAIR.poleRadius - 0.01;
  const r1 = TREAD_OUTER;
  const a0 = 0;
  const a1 = STAIR.arc + 0.01;
  const shape = new THREE.Shape();
  shape.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
  shape.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
  shape.absarc(0, 0, r1, a0, a1, false);
  shape.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
  shape.absarc(0, 0, r0, a1, a0, true);
  shape.closePath();
  const wedge = new THREE.ExtrudeGeometry(shape, { depth: TREAD_THICKNESS, bevelEnabled: false, curveSegments: 6 });
  // Shape (x, y) -> (x, 0, y): angles are kept, the extrusion hangs below the tread surface.
  wedge.rotateX(Math.PI / 2);
  // The riser closes the gap down to the tread below, along the lower edge of the wedge.
  const riserH = STAIR.rise - TREAD_THICKNESS;
  const riser = new THREE.BoxGeometry(r1 - r0, riserH, 0.02).toNonIndexed();
  riser.translate((r0 + r1) / 2, -TREAD_THICKNESS - riserH / 2, 0.01);
  const merged = mergeGeometries([wedge, riser], false);
  if (!merged) return wedge;
  wedge.dispose();
  riser.dispose();
  return merged;
})();

/** Brass handrail of one level's flight, along the outer edge of the treads (instanced per level). */
const HANDRAIL_GEOMETRY = (() => {
  const points: THREE.Vector3[] = [];
  const n = Math.ceil((RAIL_TO - RAIL_FROM) / (STAIR.arc / 4));
  for (let k = 0; k <= n; k++) {
    const phi = RAIL_FROM + ((RAIL_TO - RAIL_FROM) * k) / n;
    points.push(new THREE.Vector3(Math.cos(phi) * RAIL_RADIUS, stairRampHeight(phi) + RAIL_HEIGHT, Math.sin(phi) * RAIL_RADIUS));
  }
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return new THREE.TubeGeometry(curve, n * 2, 0.022, 8, false);
})();

/** Where the rail of a flight starts and ends: a stouter post from the tread up to the rail, capped with a ball. */
const NEWELS = [RAIL_FROM, RAIL_TO].map((phi) => {
  const tread = treadTop(Math.floor(phi / STAIR.arc));
  const rail = stairRampHeight(phi) + RAIL_HEIGHT;
  return { x: Math.cos(phi) * RAIL_RADIUS, z: Math.sin(phi) * RAIL_RADIUS, bottom: tread, top: rail };
});

/** Guard around the hole in the floor, open where the stair meets the landing. */
const GUARD_GEOMETRY = (() => {
  const r = STAIR.wellRadius + 0.06;
  const from = STAIR.entryTo + 0.08;
  const to = Math.PI * 2 + STAIR.entryFrom - 0.08;
  const points: THREE.Vector3[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const phi = from + ((to - from) * i) / n;
    points.push(new THREE.Vector3(Math.cos(phi) * r, 0.92, Math.sin(phi) * r));
  }
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return new THREE.TubeGeometry(curve, 48, 0.02, 6, false);
})();

const GUARD_POSTS = (() => {
  const r = STAIR.wellRadius + 0.06;
  const from = STAIR.entryTo + 0.08;
  const to = Math.PI * 2 + STAIR.entryFrom - 0.08;
  const out: [number, number][] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const phi = from + ((to - from) * i) / n;
    out.push([Math.cos(phi) * r, Math.sin(phi) * r]);
  }
  return out;
})();

/** Position (world) and rotation.y of the vestibule frame of gallery A at a level. */
function vestibuleFrame(level: number): { position: [number, number, number]; rotation: number } {
  const a = sideAngle(DOOR_INDEX);
  return { position: [Math.cos(a) * ROOM.apothem, level * LEVEL_H, Math.sin(a) * ROOM.apothem], rotation: facingCenterRotation(a) };
}

/** World position of a point given in the vestibule frame of level `level`. */
function vestibulePoint(level: number, x: number, y: number, z: number): [number, number, number] {
  const { position, rotation } = vestibuleFrame(level);
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [position[0] + x * c + z * s, position[1] + y, position[2] - x * s + z * c];
}

/* ── Railing around the ventilation shaft ── */
function Railing({ simple = false }: { simple?: boolean }) {
  const materials = useLibraryMaterials();
  const side = ROOM.railRadius; // hexagon side length equals its circumradius
  const mid = ROOM.railRadius * Math.cos(Math.PI / 6);
  return (
    <group>
      {Array.from({ length: 6 }, (_, k) => {
        const a = (k * Math.PI) / 3;
        const m = a + Math.PI / 6;
        const rot = facingCenterRotation(m);
        return (
          <group key={k}>
            <mesh position={[Math.cos(a) * ROOM.railRadius, ROOM.railHeight / 2, Math.sin(a) * ROOM.railRadius]} material={materials.iron}>
              <cylinderGeometry args={[0.022, 0.028, ROOM.railHeight, 8]} />
            </mesh>
            <mesh position={[Math.cos(m) * mid, ROOM.railHeight, Math.sin(m) * mid]} rotation={[0, rot, 0]} material={materials.brass}>
              <boxGeometry args={[side, 0.045, 0.045]} />
            </mesh>
            {!simple && (
              <mesh position={[Math.cos(m) * mid, ROOM.railHeight * 0.55, Math.sin(m) * mid]} rotation={[0, rot, 0]} material={materials.iron}>
                <boxGeometry args={[side, 0.02, 0.02]} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ── One of Borges' spherical lamps (the light itself comes from the light pool) ── */
function Lamp({ position }: { position: [number, number, number] }) {
  const materials = useLibraryMaterials();
  return (
    <group position={position}>
      <mesh position={[0, 0.24, 0]} material={materials.iron}>
        <cylinderGeometry args={[0.01, 0.01, 0.34, 6]} />
      </mesh>
      <mesh material={materials.lamp}>
        <sphereGeometry args={[0.13, 20, 16]} />
      </mesh>
    </group>
  );
}

/* ── The stone band of the floor slab, seen inside the shaft between two galleries ── */
function ShaftBand() {
  return (
    <mesh position={[0, ROOM.height + ROOM.slab / 2, 0]} material={STONE}>
      <cylinderGeometry args={[ROOM.shaftRadius, ROOM.shaftRadius, ROOM.slab, 6, 1, true, Math.PI / 2]} />
    </mesh>
  );
}

/* ── A neighbouring gallery seen through the shaft: floors, walls, lamps and railing only ── */
function DistantLevel() {
  const materials = useLibraryMaterials();
  return (
    <group>
      <mesh geometry={FLOOR_GEOMETRY} rotation={[-Math.PI / 2, 0, 0]} material={materials.floor} />
      <mesh geometry={FLOOR_GEOMETRY} rotation={[-Math.PI / 2, 0, 0]} position={[0, ROOM.height - 0.01, 0]} material={materials.ceiling} />
      <ShaftBand />
      {Array.from({ length: 5 }, (_, i) => {
        const a = sideAngle(i);
        const r = ROOM.apothem - CASE.depth / 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, CASE.height / 2, Math.sin(a) * r]}
            rotation={[0, facingCenterRotation(a), 0]}
            material={materials.woodDark}
          >
            <boxGeometry args={[CASE.width, CASE.height, CASE.depth]} />
          </mesh>
        );
      })}
      <Railing simple />
      <Lamp position={[2.3, 3.05, 0]} />
      <Lamp position={[-2.3, 3.05, 0]} />
    </group>
  );
}

/* ── The spiral staircase: treads, balusters, handrails, newels and pole through the nearby levels ── */
const Staircase = memo(function Staircase() {
  const materials = useLibraryMaterials();
  const treadsRef = useRef<THREE.InstancedMesh>(null);
  const balustersRef = useRef<THREE.InstancedMesh>(null);
  const railsRef = useRef<THREE.InstancedMesh>(null);
  const newelsRef = useRef<THREE.InstancedMesh>(null);
  const ballsRef = useRef<THREE.InstancedMesh>(null);
  const levels = STAIR_LEVELS.length;
  const treadCount = levels * STAIR.steps;
  const balusterCount = levels * (RAIL_LAST_TREAD - RAIL_FIRST_TREAD + 1);
  const newelCount = levels * NEWELS.length;

  useLayoutEffect(() => {
    const treads = treadsRef.current;
    const balusters = balustersRef.current;
    const rails = railsRef.current;
    const newels = newelsRef.current;
    const balls = ballsRef.current;
    if (!treads || !balusters || !rails || !newels || !balls) return;
    const d = new THREE.Object3D();
    let t = 0;
    let b = 0;
    let p = 0;
    STAIR_LEVELS.forEach((k, li) => {
      const floor = k * LEVEL_H;
      for (let i = 0; i < STAIR.steps; i++) {
        const top = floor + treadTop(i);
        d.position.set(0, top, 0);
        d.rotation.set(0, -i * STAIR.arc, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        treads.setMatrixAt(t++, d.matrix);

        if (i >= RAIL_FIRST_TREAD && i <= RAIL_LAST_TREAD) {
          const phi = (i + 0.5) * STAIR.arc;
          d.position.set(Math.cos(phi) * RAIL_RADIUS, top + RAIL_HEIGHT / 2, Math.sin(phi) * RAIL_RADIUS);
          d.rotation.set(0, 0, 0);
          d.updateMatrix();
          balusters.setMatrixAt(b++, d.matrix);
        }
      }
      d.position.set(0, floor, 0);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      rails.setMatrixAt(li, d.matrix);

      for (const newel of NEWELS) {
        const h = newel.top - newel.bottom;
        d.position.set(newel.x, floor + newel.bottom + h / 2, newel.z);
        d.scale.set(1, h, 1);
        d.updateMatrix();
        newels.setMatrixAt(p, d.matrix);
        d.position.set(newel.x, floor + newel.top, newel.z);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        balls.setMatrixAt(p, d.matrix);
        p++;
      }
    });
    for (const mesh of [treads, balusters, rails, newels, balls]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, []);

  const poleHeight = (levels + 1) * LEVEL_H;
  return (
    <group position={[STAIR.x, 0, STAIR.z]}>
      <mesh material={materials.iron}>
        <cylinderGeometry args={[STAIR.poleRadius, STAIR.poleRadius, poleHeight, 14]} />
      </mesh>
      <instancedMesh ref={treadsRef} args={[TREAD_GEOMETRY, materials.wood, treadCount]} />
      <instancedMesh ref={balustersRef} args={[undefined, undefined, balusterCount]} material={materials.iron}>
        <cylinderGeometry args={[0.011, 0.011, RAIL_HEIGHT, 6]} />
      </instancedMesh>
      <instancedMesh ref={railsRef} args={[HANDRAIL_GEOMETRY, materials.brass, levels]} />
      <instancedMesh ref={newelsRef} args={[undefined, undefined, newelCount]} material={materials.iron}>
        <cylinderGeometry args={[0.02, 0.024, 1, 8]} />
      </instancedMesh>
      <instancedMesh ref={ballsRef} args={[undefined, undefined, newelCount]} material={materials.brass}>
        <sphereGeometry args={[0.042, 12, 10]} />
      </instancedMesh>
    </group>
  );
});

/* ── Floor, ceiling and (when full) walls, closets and doorways of a vestibule ── */
function VestibuleShell({ full }: { full: boolean }) {
  const materials = useLibraryMaterials();
  const depth = ROOM.vestibuleDepth;
  const halfW = ROOM.vestibuleWidth / 2;
  const sideW = (ROOM.radius - ROOM.doorWidth) / 2;

  const wallPlane = useMemo(() => {
    const m = materials.wall.clone();
    const map = materials.textures.wall.clone();
    map.repeat.set(1.3, 1.5);
    map.needsUpdate = true;
    m.map = map;
    return m;
  }, [materials]);
  useEffect(() => () => wallPlane.dispose(), [wallPlane]);

  return (
    <group>
      <mesh geometry={VESTIBULE_FLOOR} rotation={[-Math.PI / 2, 0, 0]} material={materials.floor} />
      <mesh geometry={VESTIBULE_FLOOR} rotation={[-Math.PI / 2, 0, 0]} position={[0, ROOM.height - 0.01, 0]} material={materials.ceiling} />
      {/* Lining of the well through the floor slab above this level */}
      <mesh position={[STAIR.x, ROOM.height + ROOM.slab / 2, STAIR.z]} material={STONE}>
        <cylinderGeometry args={[STAIR.wellRadius, STAIR.wellRadius, ROOM.slab, 32, 1, true]} />
      </mesh>
      {/* Guard around the well */}
      <mesh geometry={GUARD_GEOMETRY} position={[STAIR.x, 0, STAIR.z]} material={materials.brass} />
      {GUARD_POSTS.map(([x, z], i) => (
        <mesh key={i} position={[STAIR.x + x, 0.46, STAIR.z + z]} material={materials.iron}>
          <cylinderGeometry args={[0.014, 0.018, 0.92, 6]} />
        </mesh>
      ))}

      {full && (
        <>
          {/* Doorway walls of both galleries: at z = 0 (gallery A) and z = -depth (gallery B) */}
          {[0, -depth].map((z) => (
            <group key={z} position={[0, 0, z]}>
              <mesh position={[-(ROOM.doorWidth / 2 + sideW / 2), ROOM.height / 2, 0]} material={wallPlane}>
                <boxGeometry args={[sideW, ROOM.height, 0.16]} />
              </mesh>
              <mesh position={[ROOM.doorWidth / 2 + sideW / 2, ROOM.height / 2, 0]} material={wallPlane}>
                <boxGeometry args={[sideW, ROOM.height, 0.16]} />
              </mesh>
              <mesh position={[0, ROOM.doorHeight + (ROOM.height - ROOM.doorHeight) / 2, 0]} material={wallPlane}>
                <boxGeometry args={[ROOM.doorWidth, ROOM.height - ROOM.doorHeight, 0.16]} />
              </mesh>
              <mesh position={[-(ROOM.doorWidth / 2 + 0.06), ROOM.doorHeight / 2, 0]} material={materials.woodDark}>
                <boxGeometry args={[0.12, ROOM.doorHeight + 0.12, 0.22]} />
              </mesh>
              <mesh position={[ROOM.doorWidth / 2 + 0.06, ROOM.doorHeight / 2, 0]} material={materials.woodDark}>
                <boxGeometry args={[0.12, ROOM.doorHeight + 0.12, 0.22]} />
              </mesh>
              <mesh position={[0, ROOM.doorHeight + 0.06, 0]} material={materials.woodDark}>
                <boxGeometry args={[ROOM.doorWidth + 0.24, 0.12, 0.22]} />
              </mesh>
            </group>
          ))}

          {/* Side walls */}
          <mesh position={[-halfW, ROOM.height / 2, -depth / 2]} rotation={[0, Math.PI / 2, 0]} material={wallPlane}>
            <planeGeometry args={[depth, ROOM.height]} />
          </mesh>
          <mesh position={[halfW, ROOM.height / 2, -depth / 2]} rotation={[0, -Math.PI / 2, 0]} material={wallPlane}>
            <planeGeometry args={[depth, ROOM.height]} />
          </mesh>

          {/* Two closets on the left wall */}
          {[-0.5, -2.35].map((z) => (
            <group key={z} position={[-halfW + 0.03, 1.02, z]} rotation={[0, Math.PI / 2, 0]}>
              <mesh material={materials.woodDark}>
                <boxGeometry args={[0.72, 2.04, 0.05]} />
              </mesh>
              <mesh position={[0.26, 0, 0.04]} material={materials.brass}>
                <sphereGeometry args={[0.03, 10, 8]} />
              </mesh>
            </group>
          ))}

          {/* Frame of the mirror on the right wall */}
          <mesh position={[halfW - 0.01, 1.62, -depth / 2 + 0.2]} rotation={[0, -Math.PI / 2, 0]} material={materials.brass}>
            <boxGeometry args={[1.19, 1.84, 0.02]} />
          </mesh>

          <Lamp position={[0.5, 3.05, -depth / 2]} />
        </>
      )}
    </group>
  );
}

/* ── "A mirror that faithfully duplicates appearances" ── */
const Mirror = memo(function Mirror() {
  const depth = ROOM.vestibuleDepth;
  const halfW = ROOM.vestibuleWidth / 2;
  const mirror = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1.05, 1.7);
    return new Reflector(geometry, { clipBias: 0.003, textureWidth: 512, textureHeight: 512, color: 0x9a9a9a });
  }, []);
  useEffect(() => () => mirror.dispose(), [mirror]);
  return <primitive object={mirror} position={[halfW - 0.03, 1.62, -depth / 2 + 0.2]} rotation={[0, -Math.PI / 2, 0]} />;
});

/* ── One hexagonal gallery: floor, ceiling, five walls of shelves, the shaft railing, two lamps ── */
interface GalleryRoomProps {
  seed: number;
  interactive: boolean;
  detail?: { shelf: number; titles: string[] };
  /** Wall (1..5) that carries `detail` and the focused shelf. */
  detailWall?: number;
  focusShelf?: number;
  /** A volume of this gallery that is off its shelf. */
  hidden?: HiddenVolume;
  /** Wall (1..5) whose desk lamp glows; only set for the gallery the visitor stands in. */
  deskLampWall?: number;
  onHoverBook?: (book: BookRef | null) => void;
  onClickBook?: (book: BookRef) => void;
  onHoverShelf?: (wall: number, shelf: number | null) => void;
  onClickShelf?: (wall: number, shelf: number) => void;
}

function GalleryRoom({
  seed,
  interactive,
  detail,
  detailWall,
  focusShelf,
  hidden,
  deskLampWall,
  onHoverBook,
  onClickBook,
  onHoverShelf,
  onClickShelf,
}: GalleryRoomProps) {
  const materials = useLibraryMaterials();
  const wallPlane = useMemo(() => {
    const m = materials.wall.clone();
    const map = materials.textures.wall.clone();
    map.repeat.set(1.8, 1.5);
    map.needsUpdate = true;
    m.map = map;
    return m;
  }, [materials]);
  useEffect(() => () => wallPlane.dispose(), [wallPlane]);

  return (
    <group>
      <mesh geometry={FLOOR_GEOMETRY} rotation={[-Math.PI / 2, 0, 0]} material={materials.floor} />
      <mesh geometry={FLOOR_GEOMETRY} rotation={[-Math.PI / 2, 0, 0]} position={[0, ROOM.height - 0.01, 0]} material={materials.ceiling} />
      <ShaftBand />
      {Array.from({ length: 5 }, (_, i) => {
        const a = sideAngle(i);
        const rot = facingCenterRotation(a);
        const r = ROOM.apothem;
        return (
          <group key={i}>
            <mesh position={[Math.cos(a) * r, ROOM.height / 2, Math.sin(a) * r]} rotation={[0, rot, 0]} material={wallPlane}>
              <planeGeometry args={[ROOM.radius + 0.02, ROOM.height]} />
            </mesh>
            <Bookcase
              wall={i + 1}
              seed={seed}
              position={[Math.cos(a) * BOOKCASE_RADIUS, 0, Math.sin(a) * BOOKCASE_RADIUS]}
              rotationY={rot}
              detail={detail && i + 1 === detailWall ? detail : undefined}
              focusShelf={i + 1 === detailWall ? focusShelf : undefined}
              hidden={hidden && i + 1 === hidden.wall ? { shelf: hidden.shelf, volume: hidden.volume } : undefined}
              interactive={interactive}
              onHoverBook={onHoverBook}
              onClickBook={onClickBook}
              onHoverShelf={(s) => onHoverShelf?.(i + 1, s)}
              onClickShelf={(s) => onClickShelf?.(i + 1, s)}
            />
          </group>
        );
      })}
      <Railing />
      {Array.from({ length: 5 }, (_, i) => (
        <ReadingDesk key={i} wall={i + 1} lit={i + 1 === deskLampWall} />
      ))}
      <Lamp position={[2.3, 3.05, 0]} />
      <Lamp position={[-2.3, 3.05, 0]} />
    </group>
  );
}

/* ═══════════════════════════════ The endless world ═══════════════════════════════ */

/** Where the shelf spot hangs and what it aims at, for a shelf of the gallery at (level, side): warm light, so the shelf stands out from the wall. */
function shelfSpotAt(level: number, side: GallerySide, wall: number, shelf: number) {
  const a = sideAngle(wall - 1);
  const ux = Math.cos(a);
  const uz = Math.sin(a);
  const r = BOOKCASE_RADIUS;
  const y = shelfPlankY(shelf) + CASE.shelfThickness / 2 + CASE.bookH / 2;
  return {
    position: galleryToWorld(level, side, { x: ux * (r - 1.7), y: y + 1.35, z: uz * (r - 1.7) }).toArray(),
    target: galleryToWorld(level, side, { x: ux * (r - 0.15), y, z: uz * (r - 0.15) }).toArray(),
  };
}

/**
 * A fixed set of lights that follows the visitor: the lamps of both galleries of the current level,
 * the vestibule lamps of the neighbouring levels, and a spot for the shelf being read in the current
 * gallery (dark away from the close-up). Keeping the number of lights constant means no shader is ever
 * recompiled while walking from gallery to gallery or going to a shelf.
 */
function LightPool({
  level,
  side,
  shelfSpot,
  deskLamp,
  deskLightRef,
}: {
  level: number;
  side: GallerySide;
  shelfSpot: { wall: number; shelf: number } | null;
  deskLamp: { wall: number; intensity: number } | null;
  deskLightRef?: Ref<THREE.PointLight>;
}) {
  const y = level * LEVEL_H;
  const a = galleryCenter("a", level);
  const b = galleryCenter("b", level);
  const lamps: [number, number, number][] = [
    [a[0] + 2.3, y + 3.05, a[2]],
    [a[0] - 2.3, y + 3.05, a[2]],
    [b[0] + 2.3, y + 3.05, b[2]],
    [b[0] - 2.3, y + 3.05, b[2]],
  ];
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const spotWall = shelfSpot?.wall ?? 1;
  const spotShelf = shelfSpot?.shelf ?? 1;
  const spot = useMemo(() => shelfSpotAt(level, side, spotWall, spotShelf), [level, side, spotWall, spotShelf]);
  const deskLampWall = deskLamp?.wall ?? 1;
  const deskLampPos = useMemo(() => galleryToWorld(level, side, deskLampLocal(deskLampWall)).toArray(), [level, side, deskLampWall]);
  return (
    <group>
      {lamps.map((p, i) => (
        <pointLight key={`lamp${i}`} position={p} color={LAMP_COLOR} intensity={13} distance={13} decay={2} />
      ))}
      <pointLight position={[a[0], y + 2.4, a[2]]} color="#e9c99a" intensity={3} distance={10} decay={2} />
      <pointLight position={[b[0], y + 2.4, b[2]]} color="#e9c99a" intensity={3} distance={10} decay={2} />
      {[-1, 0, 1].map((k) => (
        <pointLight key={`v${k}`} position={vestibulePoint(level + k, 0.5, 3.05, -ROOM.vestibuleDepth / 2)} color={LAMP_COLOR} intensity={4} distance={13} decay={2} />
      ))}
      <primitive object={spotTarget} position={spot.target} />
      <spotLight
        position={spot.position}
        target={spotTarget}
        angle={0.4}
        penumbra={0.8}
        intensity={shelfSpot ? 38 : 0}
        distance={8}
        decay={2}
        color="#ffdcae"
      />
      <pointLight ref={deskLightRef} position={deskLampPos} color={LAMP_COLOR} intensity={deskLamp?.intensity ?? 0} distance={3} decay={2} />
    </group>
  );
}

/** Tells its gallery cell that the content of the cell's Suspense boundary has mounted. */
function CellReady({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

interface GalleryCellProps {
  worldHex: string;
  level: number;
  side: GallerySide;
  interactive: boolean;
  detail: ShelfDetail | null;
  hidden: HiddenVolume | null;
  /** Wall (1..5) whose desk lamp glows; only set for the gallery the visitor stands in. */
  deskLampWall?: number;
  /** Called when the cell has loaded and mounted. */
  onReady?: () => void;
  onHoverBook?: (book: BookRef | null) => void;
  onClickBook?: (book: BookRef) => void;
  onHoverShelf?: (wall: number, shelf: number | null) => void;
  onClickShelf?: (wall: number, shelf: number) => void;
}

/**
 * One gallery of the world with its own materials; loads in the background behind its own Suspense boundary.
 * Memoised, like the world's other parts: what changes for one gallery (a volume taken off its shelf, a lamp lit, a
 * shelf in close-up) re-renders that gallery only, and a flight starting or landing does not stall on the rest.
 */
const GalleryCell = memo(function GalleryCell({
  worldHex,
  level,
  side,
  interactive,
  detail,
  hidden,
  deskLampWall,
  onReady,
  onHoverBook,
  onClickBook,
  onHoverShelf,
  onClickShelf,
}: GalleryCellProps) {
  const seed = useMemo(() => hashString(cellHex(worldHex, level, side)), [worldHex, level, side]);
  // One object per shelf and set of titles: a new object would draw every titled spine again.
  const detailShelf = detail?.shelf;
  const detailTitles = detail?.titles;
  const shelfDetail = useMemo(
    () => (detailShelf !== undefined && detailTitles ? { shelf: detailShelf, titles: detailTitles } : undefined),
    [detailShelf, detailTitles]
  );
  return (
    <Suspense fallback={null}>
      <LibraryMaterialsProvider seed={seed}>
        <group position={galleryCenter(side, level)} rotation={[0, galleryRotation(side), 0]}>
          <GalleryRoom
            seed={seed}
            interactive={interactive}
            detail={shelfDetail}
            detailWall={detail?.wall}
            focusShelf={detailShelf}
            hidden={hidden ?? undefined}
            deskLampWall={deskLampWall}
            onHoverBook={onHoverBook}
            onClickBook={onClickBook}
            onHoverShelf={onHoverShelf}
            onClickShelf={onClickShelf}
          />
        </group>
        {onReady && <CellReady onReady={onReady} />}
      </LibraryMaterialsProvider>
    </Suspense>
  );
});

/** The vestibule of a level, dressed like its gallery A. */
const VestibuleCell = memo(function VestibuleCell({ worldHex, level }: { worldHex: string; level: number }) {
  const seed = useMemo(() => hashString(cellHex(worldHex, level, "a")), [worldHex, level]);
  const frame = vestibuleFrame(level);
  return (
    <Suspense fallback={null}>
      <LibraryMaterialsProvider seed={seed}>
        <group position={frame.position} rotation={[0, frame.rotation, 0]}>
          <VestibuleShell full />
        </group>
      </LibraryMaterialsProvider>
    </Suspense>
  );
});

/** Far-off levels of both galleries, seen through the shafts, dressed like the gallery the visitor is in. */
const DistantWorld = memo(function DistantWorld({ seed, level }: { seed: number; level: number }) {
  const ks = useMemo(() => {
    const out: number[] = [];
    for (let k = level - ROOM.levelsBelow; k <= level + ROOM.levelsAbove; k++) if (Math.abs(k - level) > 1) out.push(k);
    return out;
  }, [level]);
  return (
    <Suspense fallback={null}>
      <LibraryMaterialsProvider seed={seed}>
        {ks.map((k) => {
          const frame = vestibuleFrame(k);
          return (
            <Fragment key={k}>
              <group position={galleryCenter("a", k)}>
                <DistantLevel />
              </group>
              <group position={galleryCenter("b", k)} rotation={[0, Math.PI, 0]}>
                <DistantLevel />
              </group>
              <group position={frame.position} rotation={[0, frame.rotation, 0]}>
                <VestibuleShell full={false} />
              </group>
            </Fragment>
          );
        })}
      </LibraryMaterialsProvider>
    </Suspense>
  );
});

function PreloadAllTextures() {
  useEffect(() => {
    useTexture.preload(ALL_TEXTURE_URLS);
  }, []);
  return null;
}

type WorldCallbacks = Pick<GalleryWorldProps, "onFacingSide" | "onPlace" | "onCurrentCellReady">;

/**
 * The endless world around one address: the galleries of the visitor's level and the levels next to it, the
 * stair, the far levels, and the controls. It stays on the stage while the visitor walks or reads a shelf;
 * what the controls do is set from outside through `controlsRef`. Memoised: HUD state changes (tooltips,
 * banners) must not re-render the world.
 */
const GalleryWorld = memo(function GalleryWorld({
  worldHex,
  initialPose,
  initialPlace,
  controlsRef,
  interactive,
  detail,
  hidden,
  shelfSpot,
  deskLamp,
  deskLightRef,
  onCurrentCellReady,
  onHoverBook,
  onClickBook,
  onHoverShelf,
  onClickShelf,
  onFacingSide,
  onPlace,
  onInteract,
  onLockChange,
}: GalleryWorldProps) {
  const [current, setCurrent] = useState<{ level: number; side: GallerySide }>(() => initialPlace ?? { level: 0, side: "a" });
  const currentRef = useRef(current);
  const callbacks = useRef<WorldCallbacks>({ onFacingSide, onPlace, onCurrentCellReady });
  // Read by `onFrame`, a render-loop callback memoised per world: never from its closure.
  const walking = useRef(interactive === "walk");
  useLayoutEffect(() => {
    callbacks.current = { onFacingSide, onPlace, onCurrentCellReady };
    walking.current = interactive === "walk";
  });
  const lastSide = useRef(-1);
  const feet = useRef(new THREE.Vector3());
  // The controls take the starting eye once, when they mount.
  const [start] = useState(() => ({
    position: [initialPose.position.x, initialPose.position.y, initialPose.position.z] as [number, number, number],
    yaw: initialPose.yaw,
    pitch: initialPose.pitch,
  }));

  const cellReported = useRef(false);
  const reportCellReady = useCallback(() => {
    if (cellReported.current) return;
    cellReported.current = true;
    callbacks.current.onCurrentCellReady?.();
  }, []);

  const onFrame = useCallback(
    (yaw: number, position: THREE.Vector3) => {
      // Only a walking visitor goes from gallery to gallery and turns to face walls; a close-up hangs over the shaft.
      if (!walking.current) {
        lastSide.current = -1;
        return;
      }
      const cur = currentRef.current;
      feet.current.set(position.x, position.y - ROOM.eyeHeight, position.z);
      const cell = cellAt(feet.current);
      const level = trackLevel(feet.current.y, cur.level);
      if (level !== cur.level || (cell.side !== "v" && cell.side !== cur.side)) {
        const next = { level, side: cell.side === "v" ? cur.side : cell.side };
        currentRef.current = next;
        setCurrent(next);
        callbacks.current.onPlace?.({ ...next, hex: cellHex(worldHex, next.level, next.side) });
        lastSide.current = -1;
      }
      const s = facingSide(yaw - galleryRotation(currentRef.current.side));
      if (s !== lastSide.current) {
        lastSide.current = s;
        callbacks.current.onFacingSide?.(s);
      }
    },
    [worldHex]
  );

  const levels = useMemo(() => [current.level - 1, current.level, current.level + 1], [current.level]);
  const currentSeed = useMemo(() => hashString(cellHex(worldHex, current.level, current.side)), [worldHex, current]);
  // The stair spans several levels around the visitor and one turn of it is one level, so when the
  // visitor changes level it only moves by a level: every tread stays exactly where it was.
  const stairFrame = vestibuleFrame(current.level);

  return (
    <group>
      <GalleryControls
        ref={controlsRef}
        initialPosition={start.position}
        initialYaw={start.yaw}
        initialPitch={start.pitch}
        walk
        pointerLock
        eyeHeight={ROOM.eyeHeight}
        pitchRange={[-1.1, 1.1]}
        fovRange={[34, 72]}
        initialFov={58}
        constrain={constrainWalk}
        onFrame={onFrame}
        onInteract={onInteract}
        onLockChange={onLockChange}
      />
      <PreloadAllTextures />

      <fog attach="fog" args={["#07060a", 4, 24]} />
      <hemisphereLight args={["#5a5270", "#1a140c", 0.85]} />
      <LightPool level={current.level} side={current.side} shelfSpot={shelfSpot} deskLamp={deskLamp} deskLightRef={deskLightRef} />

      {levels.map((k) => (
        <Fragment key={k}>
          {(["a", "b"] as const).map((side) => {
            const here = k === current.level && side === current.side;
            return (
              <GalleryCell
                key={side}
                worldHex={worldHex}
                level={k}
                side={side}
                interactive={here && interactive !== "none"}
                detail={here ? detail : null}
                hidden={hidden && hidden.level === k && hidden.side === side ? hidden : null}
                deskLampWall={here ? deskLamp?.wall : undefined}
                onReady={here ? reportCellReady : undefined}
                onHoverBook={onHoverBook}
                onClickBook={onClickBook}
                onHoverShelf={onHoverShelf}
                onClickShelf={onClickShelf}
              />
            );
          })}
          <VestibuleCell worldHex={worldHex} level={k} />
        </Fragment>
      ))}

      <group position={stairFrame.position} rotation={[0, stairFrame.rotation, 0]}>
        <Staircase />
        <Mirror />
      </group>

      <DistantWorld seed={currentSeed} level={current.level} />
    </group>
  );
});

export default GalleryWorld;

export type { BookRef };
export { LIBRARY };
