"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Edges } from "@react-three/drei";
import * as THREE from "three";

interface BookshelfSceneProps {
  wall: number;
  shelf: number;
  onVolumeClick: (volume: number) => void;
}

function BookVolume({
  volumeNumber,
  position,
  height,
  width,
  color,
  onClick,
}: {
  volumeNumber: number;
  position: [number, number, number];
  height: number;
  width: number;
  color: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      const targetZ = hovered ? 0.15 : 0;
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
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[width, height, 0.6]} />
        <meshStandardMaterial
          color={color}
          emissive={hovered ? "#c9a84c" : "#000000"}
          emissiveIntensity={hovered ? 0.15 : 0}
          roughness={0.8}
          metalness={0.1}
        />
        {hovered && (
          <Edges scale={1} color="#c9a84c" lineWidth={2} />
        )}
      </mesh>

      {/* Spine text */}
      <group ref={labelRef}>
        <Text
          position={[0, 0, 0.31]}
          fontSize={0.09}
          color={hovered ? "#fff" : "#9e9bb5"}
          anchorX="center"
          anchorY="middle"
          rotation={[0, 0, -Math.PI / 2]}
        >
          {`ТОМ ${volumeNumber}`}
        </Text>
      </group>

      {/* Gold line detail on spine */}
      <mesh position={[0, height / 2 - 0.06, 0.31]}>
        <planeGeometry args={[width * 0.6, 0.01]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={hovered ? 0.8 : 0.3} />
      </mesh>
      <mesh position={[0, -height / 2 + 0.06, 0.31]}>
        <planeGeometry args={[width * 0.6, 0.01]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={hovered ? 0.8 : 0.3} />
      </mesh>
      </group>
    </group>
  );
}

export default function BookshelfScene({ wall, shelf, onVolumeClick }: BookshelfSceneProps) {
  const volumes = 31;

  // Arrange books in rows on shelves
  const booksPerRow = 11;
  const rows = Math.ceil(volumes / booksPerRow);

  const bookColors = [
    "#2a1f0e", "#1a2a1a", "#1a1a2e", "#2e1a1a", "#2a2a1a",
    "#1a2e2a", "#2e1a2a", "#1e1e1e", "#2a1a1a", "#1a2a2a",
    "#25200f", "#1f251f", "#1f1f29", "#291f1f", "#25251f",
  ];

  return (
    <group>
      {/* Back wall */}
      <mesh position={[0, 0, -0.5]}>
        <planeGeometry args={[8, 5]} />
        <meshStandardMaterial color="#111119" side={THREE.DoubleSide} />
      </mesh>

      {/* Shelf label */}
      <Text
        position={[0, 2.2, 0]}
        fontSize={0.18}
        color="#c9a84c"
        anchorX="center"
        anchorY="middle"
      >
        {`СТЕНА ${wall} · ПОЛКА ${shelf}`}
      </Text>

      {/* Decorative line under label */}
      <mesh position={[0, 2.05, 0]}>
        <planeGeometry args={[2.5, 0.005]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={0.4} />
      </mesh>

      {/* Book rows */}
      {Array.from({ length: rows }, (_, row) => {
        const booksInRow = row === rows - 1 ? volumes - row * booksPerRow : booksPerRow;
        const rowY = 1.2 - row * 1.3;
        const totalWidth = booksInRow * 0.35;
        const startX = -totalWidth / 2;

        return (
          <group key={row}>
            {/* Shelf plank */}
            <mesh position={[0, rowY - 0.55, 0]}>
              <boxGeometry args={[6, 0.08, 0.8]} />
              <meshStandardMaterial color="#3a2e1a" roughness={0.9} />
            </mesh>

            {/* Books in this row */}
            {Array.from({ length: booksInRow }, (_, i) => {
              const volNum = row * booksPerRow + i + 1;
              const bookWidth = 0.2 + Math.sin(volNum * 1.7) * 0.06;
              const bookHeight = 0.7 + Math.sin(volNum * 2.3) * 0.15;
              const bookX = startX + i * 0.35 + bookWidth / 2;
              const bookColor = bookColors[volNum % bookColors.length];

              return (
                <BookVolume
                  key={volNum}
                  volumeNumber={volNum}
                  position={[bookX, rowY - 0.15 + bookHeight / 2 - 0.35, 0]}
                  height={bookHeight}
                  width={bookWidth}
                  color={bookColor}
                  onClick={() => onVolumeClick(volNum)}
                />
              );
            })}
          </group>
        );
      })}

      {/* Side panels */}
      <mesh position={[-3.5, 0, 0]}>
        <boxGeometry args={[0.1, 5, 0.8]} />
        <meshStandardMaterial color="#2a1f0e" />
      </mesh>
      <mesh position={[3.5, 0, 0]}>
        <boxGeometry args={[0.1, 5, 0.8]} />
        <meshStandardMaterial color="#2a1f0e" />
      </mesh>
    </group>
  );
}
