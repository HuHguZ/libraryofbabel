"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface VolumeSceneProps {
  onPageClick: (page: number) => void;
}

const TOTAL_PAGES = 421;
const PAGES_PER_ROW = 21;
const CARD_W = 0.2;
const CARD_H = 0.26;
const CARD_D = 0.003;
const GAP_X = 0.23;
const GAP_Y = 0.3;

/* ── Page grid (instanced mesh) ── */
function PageGrid({
  onPageClick,
  onHover,
}: {
  onPageClick: (page: number) => void;
  onHover: (id: number | null, pos: THREE.Vector3 | null) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const prevHoveredRef = useRef<number | null>(null);
  const rows = Math.ceil(TOTAL_PAGES / PAGES_PER_ROW);

  const basePositions = useMemo(() => {
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < TOTAL_PAGES; i++) {
      const row = Math.floor(i / PAGES_PER_ROW);
      const col = i % PAGES_PER_ROW;
      const x = (col - (PAGES_PER_ROW - 1) / 2) * GAP_X;
      const y = ((rows - 1) / 2 - row) * GAP_Y;
      positions.push(new THREE.Vector3(x, y, 0));
    }
    return positions;
  }, [rows]);

  const baseColor = useMemo(() => new THREE.Color("#dcc8a0"), []);
  const hoverColor = useMemo(() => new THREE.Color("#f5e8c8"), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < TOTAL_PAGES; i++) {
      const pos = basePositions[i];
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, baseColor);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingBox();
    meshRef.current.computeBoundingSphere();
    if (meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true;
  }, [basePositions, baseColor]);

  useEffect(() => {
    if (!meshRef.current) return;
    const prev = prevHoveredRef.current;
    if (prev !== null) meshRef.current.setColorAt(prev, baseColor);
    if (hoveredId !== null) meshRef.current.setColorAt(hoveredId, hoverColor);
    if (meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true;
    prevHoveredRef.current = hoveredId;
  }, [hoveredId, baseColor, hoverColor]);

  const animatingRef = useRef<Set<number>>(new Set());

  useFrame(() => {
    if (!meshRef.current) return;
    // Track which instances need animation
    if (hoveredId !== null) animatingRef.current.add(hoveredId);
    const prev = prevHoveredRef.current;
    if (prev !== null && prev !== hoveredId) animatingRef.current.add(prev);
    if (animatingRef.current.size === 0) return;

    const dummy = new THREE.Object3D();
    let needsUpdate = false;
    const done: number[] = [];

    for (const i of animatingRef.current) {
      const pos = basePositions[i];
      const targetZ = hoveredId === i ? 0.15 : 0;

      meshRef.current.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

      const newZ = THREE.MathUtils.lerp(dummy.position.z, targetZ, 0.12);
      if (Math.abs(newZ - targetZ) < 0.0005) {
        dummy.position.set(pos.x, pos.y, targetZ);
        done.push(i);
      } else {
        dummy.position.set(pos.x, pos.y, newZ);
      }
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      needsUpdate = true;
    }

    for (const i of done) animatingRef.current.delete(i);
    if (needsUpdate) meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        setHoveredId(e.instanceId);
        onHover(e.instanceId, basePositions[e.instanceId]);
        document.body.style.cursor = "pointer";
      }
    },
    [onHover, basePositions]
  );

  const handlePointerOut = useCallback(() => {
    setHoveredId(null);
    onHover(null, null);
    document.body.style.cursor = "default";
  }, [onHover]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        onPageClick(e.instanceId + 1);
      }
    },
    [onPageClick]
  );

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, TOTAL_PAGES]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <boxGeometry args={[CARD_W, CARD_H, CARD_D]} />
      <meshStandardMaterial roughness={0.85} metalness={0.02} />
    </instancedMesh>
  );
}

/* ── Page number labels on every page ── */
const LABEL_Z = CARD_D + 0.004;
const LABEL_Z_HOVER = 0.15 + LABEL_Z;

function PageLabels({ hoveredId }: { hoveredId: number | null }) {
  const rows = Math.ceil(TOTAL_PAGES / PAGES_PER_ROW);

  const labels = useMemo(() => {
    const result: { num: number; x: number; y: number }[] = [];
    for (let i = 0; i < TOTAL_PAGES; i++) {
      const row = Math.floor(i / PAGES_PER_ROW);
      const col = i % PAGES_PER_ROW;
      const x = (col - (PAGES_PER_ROW - 1) / 2) * GAP_X;
      const y = ((rows - 1) / 2 - row) * GAP_Y;
      result.push({ num: i + 1, x, y });
    }
    return result;
  }, [rows]);

  return (
    <>
      {labels.map(({ num, x, y }) => (
        <Text
          key={num}
          position={[x, y, hoveredId === num - 1 ? LABEL_Z_HOVER : LABEL_Z]}
          fontSize={0.075}
          color={hoveredId === num - 1 ? "#5a4a2e" : "#3a2a15"}
          anchorX="center"
          anchorY="middle"
        >
          {`${num}`}
        </Text>
      ))}
    </>
  );
}

/* ── Floating hover tooltip ── */
function HoverTooltip({
  pageNum,
  position,
}: {
  pageNum: number;
  position: THREE.Vector3;
}) {
  const targetX = position.x;
  const targetY = position.y + CARD_H / 2 + 0.16;
  const groupRef = useRef<THREE.Group>(null);
  const initialized = useRef(false);

  useFrame(() => {
    if (!groupRef.current) return;
    if (!initialized.current) {
      groupRef.current.position.set(targetX, targetY, 0.25);
      initialized.current = true;
      return;
    }
    groupRef.current.position.x = THREE.MathUtils.lerp(
      groupRef.current.position.x,
      targetX,
      0.25
    );
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      targetY,
      0.25
    );
    groupRef.current.position.z = 0.25;
  });

  return (
    <group ref={groupRef} position={[targetX, targetY, 0.25]}>
      {/* Background */}
      <mesh>
        <planeGeometry args={[0.7, 0.2]} />
        <meshBasicMaterial color="#12100a" transparent opacity={0.92} />
      </mesh>
      {/* Gold border */}
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[0.74, 0.24]} />
        <meshBasicMaterial color="#c9a84c" transparent opacity={0.4} />
      </mesh>
      <Text
        position={[0, 0, 0.01]}
        fontSize={0.08}
        color="#c9a84c"
        anchorX="center"
        anchorY="middle"
      >
        {`Страница ${pageNum}`}
      </Text>
    </group>
  );
}

/* ── Book frame around the pages ── */
function BookFrame() {
  const rows = Math.ceil(TOTAL_PAGES / PAGES_PER_ROW);
  const gridW = (PAGES_PER_ROW - 1) * GAP_X + CARD_W + 0.3;
  const gridH = (rows - 1) * GAP_Y + CARD_H + 0.3;
  const frameThickness = 0.14;
  const depth = 0.06;

  return (
    <group position={[0, 0, -0.05]}>
      {/* Background parchment surface */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[gridW - 0.05, gridH - 0.05]} />
        <meshStandardMaterial
          color="#c4b48a"
          roughness={0.95}
          transparent
          opacity={0.08}
        />
      </mesh>

      {/* Leather frame — top */}
      <mesh position={[0, gridH / 2, 0]}>
        <boxGeometry args={[gridW + frameThickness, frameThickness, depth]} />
        <meshStandardMaterial color="#2a1a0c" roughness={0.85} />
      </mesh>
      {/* Leather frame — bottom */}
      <mesh position={[0, -gridH / 2, 0]}>
        <boxGeometry args={[gridW + frameThickness, frameThickness, depth]} />
        <meshStandardMaterial color="#2a1a0c" roughness={0.85} />
      </mesh>
      {/* Leather frame — left */}
      <mesh position={[-gridW / 2, 0, 0]}>
        <boxGeometry args={[frameThickness, gridH + frameThickness, depth]} />
        <meshStandardMaterial color="#2a1a0c" roughness={0.85} />
      </mesh>
      {/* Leather frame — right */}
      <mesh position={[gridW / 2, 0, 0]}>
        <boxGeometry args={[frameThickness, gridH + frameThickness, depth]} />
        <meshStandardMaterial color="#2a1a0c" roughness={0.85} />
      </mesh>

      {/* Gold inner trim — top */}
      <mesh position={[0, gridH / 2 - frameThickness / 2 - 0.01, 0.02]}>
        <boxGeometry args={[gridW - frameThickness, 0.015, 0.005]} />
        <meshStandardMaterial color="#c9a84c" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Gold inner trim — bottom */}
      <mesh position={[0, -gridH / 2 + frameThickness / 2 + 0.01, 0.02]}>
        <boxGeometry args={[gridW - frameThickness, 0.015, 0.005]} />
        <meshStandardMaterial color="#c9a84c" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Gold inner trim — left */}
      <mesh position={[-gridW / 2 + frameThickness / 2 + 0.01, 0, 0.02]}>
        <boxGeometry args={[0.015, gridH - frameThickness, 0.005]} />
        <meshStandardMaterial color="#c9a84c" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Gold inner trim — right */}
      <mesh position={[gridW / 2 - frameThickness / 2 - 0.01, 0, 0.02]}>
        <boxGeometry args={[0.015, gridH - frameThickness, 0.005]} />
        <meshStandardMaterial color="#c9a84c" roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Corner ornaments */}
      {[
        [-gridW / 2, gridH / 2],
        [gridW / 2, gridH / 2],
        [-gridW / 2, -gridH / 2],
        [gridW / 2, -gridH / 2],
      ].map(([cx, cy], idx) => (
        <group key={idx} position={[cx, cy, 0.03]}>
          <mesh>
            <circleGeometry args={[0.07, 16]} />
            <meshStandardMaterial
              color="#c9a84c"
              roughness={0.3}
              metalness={0.6}
            />
          </mesh>
          <mesh>
            <ringGeometry args={[0.07, 0.09, 16]} />
            <meshStandardMaterial
              color="#8a7030"
              roughness={0.4}
              metalness={0.5}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Main scene ── */
export default function VolumeScene({
  onPageClick,
}: VolumeSceneProps) {
  const [hoverState, setHoverState] = useState<{
    id: number | null;
    pos: THREE.Vector3 | null;
  }>({ id: null, pos: null });

  const handleHover = useCallback(
    (id: number | null, pos: THREE.Vector3 | null) => {
      setHoverState({ id, pos });
    },
    []
  );

  return (
    <group>
      {/* Book frame */}
      <BookFrame />

      {/* Pages grid */}
      <PageGrid onPageClick={onPageClick} onHover={handleHover} />
      <PageLabels hoveredId={hoverState.id} />

      {/* Hover tooltip */}
      {hoverState.id !== null && hoverState.pos && (
        <HoverTooltip
          pageNum={hoverState.id + 1}
          position={hoverState.pos}
        />
      )}
    </group>
  );
}
