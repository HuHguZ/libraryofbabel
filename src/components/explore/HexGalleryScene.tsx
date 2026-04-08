"use client";

import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

const VOLUMES_PER_SHELF = 31;
const BOOKS_WIDTH = 2.5;
const BOOK_SPACING = BOOKS_WIDTH / VOLUMES_PER_SHELF;

interface HexGallerySceneProps {
  activeWall: number;
  onShelfClick: (shelf: number) => void;
  onVolumeClick: (shelf: number, volume: number) => void;
}

function HexWall({
  index,
  isActive,
  position,
  rotation,
  onShelfClick,
  onVolumeClick,
}: {
  index: number;
  isActive: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  onShelfClick: (shelf: number) => void;
  onVolumeClick: (shelf: number, volume: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Wall panel */}
      <mesh>
        <planeGeometry args={[3.2, 5]} />
        <meshStandardMaterial
          color={isActive ? "#1a1a2e" : "#111119"}
          emissive={isActive ? "#c9a84c" : "#000000"}
          emissiveIntensity={isActive ? 0.05 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Wall number label */}
      <Text
        position={[0, 2.2, 0.01]}
        fontSize={0.15}
        color={isActive ? "#c9a84c" : "#4a4760"}
        anchorX="center"
        anchorY="middle"
      >
        {`СТЕНА ${index}`}
      </Text>

      {/* Shelves on this wall */}
      {Array.from({ length: 7 }, (_, i) => {
        const shelfY = 1.5 - i * 0.6;
        return (
          <ShelfOnWall
            key={i}
            shelfNumber={i + 1}
            position={[0, shelfY, 0.02]}
            isActive={isActive}
            onShelfClick={() => isActive && onShelfClick(i + 1)}
            onVolumeClick={(volume: number) => isActive && onVolumeClick(i + 1, volume)}
          />
        );
      })}

      {/* Wall border glow for active wall */}
      {isActive && (
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[3.3, 5.1]} />
          <meshBasicMaterial color="#c9a84c" transparent opacity={0.06} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function MiniBook({
  volumeNumber,
  position,
  height,
  color,
  isActive,
  onClick,
}: {
  volumeNumber: number;
  position: [number, number, number];
  height: number;
  color: THREE.Color;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      const targetZ = hovered && isActive ? 0.08 : 0;
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, 0.1);
    }
  });

  return (
    <group position={position}>
      <group ref={groupRef}>
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            if (isActive) document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHovered(false);
            document.body.style.cursor = "default";
          }}
        >
          <boxGeometry args={[0.07, height, 0.15]} />
          <meshStandardMaterial
            color={color}
            emissive={hovered && isActive ? "#c9a84c" : "#000000"}
            emissiveIntensity={hovered && isActive ? 0.4 : 0}
          />
        </mesh>
        {/* Volume number on spine — facing viewer */}
        <Text
          position={[0, 0, 0.076]}
          fontSize={0.035}
          color={hovered && isActive ? "#fff" : "#7a7590"}
          anchorX="center"
          anchorY="middle"
          rotation={[0, 0, -Math.PI / 2]}
        >
          {`${volumeNumber}`}
        </Text>
      </group>
    </group>
  );
}

function ShelfOnWall({
  shelfNumber,
  position,
  isActive,
  onShelfClick,
  onVolumeClick,
}: {
  shelfNumber: number;
  position: [number, number, number];
  isActive: boolean;
  onShelfClick: () => void;
  onVolumeClick: (volume: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  const bookColors = useMemo(() =>
    Array.from({ length: VOLUMES_PER_SHELF }, (_, i) => {
      const hue = (i * 0.03 + shelfNumber * 0.1) % 1;
      return new THREE.Color().setHSL(hue, 0.15, 0.15);
    }),
    [shelfNumber]
  );

  useFrame(() => {
    if (meshRef.current) {
      const target = hovered && isActive ? 0.08 : 0;
      meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, position[2] + target, 0.1);
    }
  });

  return (
    <group position={[position[0], position[1], 0]}>
      {/* Shelf plank — clickable to navigate to shelf page */}
      <mesh
        ref={meshRef}
        position={[0, 0, position[2]]}
        onClick={(e) => {
          e.stopPropagation();
          onShelfClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          if (isActive) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[2.8, 0.04, 0.2]} />
        <meshStandardMaterial
          color="#3a2e1a"
          emissive={hovered && isActive ? "#c9a84c" : "#000000"}
          emissiveIntensity={hovered && isActive ? 0.2 : 0}
        />
      </mesh>

      {/* Mini books with volume labels — each clickable */}
      {Array.from({ length: VOLUMES_PER_SHELF }, (_, i) => {
        const volNum = i + 1;
        const bookH = 0.18 + Math.sin(volNum * 2.3) * 0.06;
        const bookX = -BOOKS_WIDTH / 2 + i * BOOK_SPACING + BOOK_SPACING / 2;

        return (
          <MiniBook
            key={volNum}
            volumeNumber={volNum}
            position={[bookX, bookH / 2 + 0.02, position[2]]}
            height={bookH}
            color={bookColors[i]}
            isActive={isActive}
            onClick={() => onVolumeClick(volNum)}
          />
        );
      })}

      {/* Shelf number label */}
      <Text
        position={[1.5, 0.08, position[2] + 0.05]}
        fontSize={0.07}
        color={hovered && isActive ? "#c9a84c" : "#4a4760"}
        anchorX="center"
        anchorY="middle"
      >
        {`п.${shelfNumber}`}
      </Text>
    </group>
  );
}

export default function HexGalleryScene({ activeWall, onShelfClick, onVolumeClick }: HexGallerySceneProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Build hexagonal gallery — 6 walls (we use 5, 6th is the entrance)
  const wallCount = 6;
  const radius = 4;

  return (
    <group ref={groupRef}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]}>
        <circleGeometry args={[radius + 1, 6]} />
        <meshStandardMaterial color="#0c0c14" />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 2.8, 0]}>
        <circleGeometry args={[radius + 1, 6]} />
        <meshStandardMaterial color="#0c0c14" transparent opacity={0.8} />
      </mesh>

      {/* Central light fixture */}
      <pointLight position={[0, 2.5, 0]} intensity={0.4} color="#c9a84c" distance={8} />
      <mesh position={[0, 2.6, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={0.6} />
      </mesh>

      {/* Walls */}
      {Array.from({ length: wallCount }, (_, i) => {
        const angle = (i / wallCount) * Math.PI * 2 + Math.PI / 6;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const wallRotation = angle + Math.PI / 2;

        if (i === 5) {
          // 6th side is the entrance/archway
          return (
            <group key={i} position={[x, 0, z]} rotation={[0, -wallRotation, 0]}>
              {/* Archway frame */}
              <mesh position={[-1.2, 0, 0]}>
                <boxGeometry args={[0.4, 5, 0.2]} />
                <meshStandardMaterial color="#1a1a2e" />
              </mesh>
              <mesh position={[1.2, 0, 0]}>
                <boxGeometry args={[0.4, 5, 0.2]} />
                <meshStandardMaterial color="#1a1a2e" />
              </mesh>
              <mesh position={[0, 2.3, 0]}>
                <boxGeometry args={[2.8, 0.4, 0.2]} />
                <meshStandardMaterial color="#1a1a2e" />
              </mesh>
            </group>
          );
        }

        const wallNumber = i + 1;
        return (
          <HexWall
            key={i}
            index={wallNumber}
            isActive={wallNumber === activeWall}
            position={[x, 0, z]}
            rotation={[0, -wallRotation, 0]}
            onShelfClick={onShelfClick}
            onVolumeClick={onVolumeClick}
          />
        );
      })}

      {/* Floor details — hex pattern hint */}
      {Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const lineEnd = radius * 0.9;
        return (
          <mesh key={`line-${i}`} rotation={[-Math.PI / 2, 0, angle]} position={[0, -2.49, 0]}>
            <planeGeometry args={[0.02, lineEnd * 2]} />
            <meshBasicMaterial color="#c9a84c" transparent opacity={0.08} />
          </mesh>
        );
      })}
    </group>
  );
}
