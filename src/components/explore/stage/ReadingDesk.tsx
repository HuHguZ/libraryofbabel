"use client";

import * as THREE from "three";
import { ROOM, sideAngle } from "../geometry";
import { useLibraryMaterials } from "../materials";
import { DESK, deskCenterLocal, deskCorners, deskLampLocal } from "./deskFrame";

/** The globe of an unlit desk lamp: one dim material shared by every desk, so lighting one never adds a program. */
const DIM_GLOBE = new THREE.MeshStandardMaterial({ color: new THREE.Color("#786f61"), roughness: 0.6 });

/** Where the brackets stop: the railing's lower iron crossbar (see `Railing` in HexGalleryScene). */
const BRACKET_BOTTOM = ROOM.railHeight * 0.55;

export interface ReadingDeskProps {
  /** Wall (1..5) the desk faces, across the shaft. */
  wall: number;
  /** Whether the lamp's globe glows; only the current cell's active desk does. */
  lit: boolean;
}

/**
 * A reading desk standing at the shaft railing, facing wall `wall`: a board, two iron brackets
 * reaching down to the railing, and a small brass lamp. Gallery-local (floor y = 0), like the rest
 * of `GalleryRoom` — this is not meant to be rendered for `DistantLevel`.
 */
export default function ReadingDesk({ wall, lit }: ReadingDeskProps) {
  const materials = useLibraryMaterials();
  const a = sideAngle(wall - 1);
  const u = { x: Math.cos(a), z: Math.sin(a) };
  const yaw = Math.atan2(u.x, u.z);
  const center = deskCenterLocal(wall);
  const lamp = deskLampLocal(wall);
  const boardY = DESK.top - DESK.board / 2;
  const bracketHeight = boardY - DESK.board / 2 - BRACKET_BOTTOM;
  const bracketY = BRACKET_BOTTOM + bracketHeight / 2;
  // The two corners nearest the rail (see deskCorners: along = -depth/2 comes first).
  const [innerLeft, innerRight] = deskCorners(wall);

  return (
    <group>
      <mesh position={[center.x, boardY, center.z]} rotation={[0, yaw, 0]} material={materials.woodDark}>
        <boxGeometry args={[DESK.width, DESK.board, DESK.depth]} />
      </mesh>
      {[innerLeft, innerRight].map((corner, i) => (
        <mesh key={i} position={[corner.x, bracketY, corner.z]} material={materials.iron}>
          <boxGeometry args={[0.03, bracketHeight, 0.03]} />
        </mesh>
      ))}
      <mesh position={[lamp.x, DESK.top + 0.01, lamp.z]} material={materials.brass}>
        <cylinderGeometry args={[0.04, 0.04, 0.02, 12]} />
      </mesh>
      <mesh position={[lamp.x, DESK.top + 0.15, lamp.z]} material={materials.brass}>
        <cylinderGeometry args={[0.006, 0.006, 0.26, 8]} />
      </mesh>
      <mesh position={[lamp.x, lamp.y, lamp.z]} material={lit ? materials.lamp : DIM_GLOBE}>
        <sphereGeometry args={[0.035, 16, 12]} />
      </mesh>
    </group>
  );
}
