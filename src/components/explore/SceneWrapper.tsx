"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Box, Text } from "@chakra-ui/react";
import { motion } from "framer-motion";
import { ReactNode, Suspense, useState, useEffect, useRef } from "react";
import * as THREE from "three";

interface SceneWrapperProps {
  children: ReactNode;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  height?: Record<string, string> | string;
}

function SceneReadyDetector({ onReady }: { onReady: () => void }) {
  useState(() => {
    onReady();
  });
  return null;
}

function KeyboardMovement({ controlsRef }: { controlsRef: React.RefObject<typeof OrbitControls extends React.ForwardRefExoticComponent<infer P> ? (P extends { ref?: React.Ref<infer T> } ? T : never) : never> }) {
  const { camera } = useThree();
  const keys = useRef<Set<string>>(new Set());
  const speed = 3;

  const moveCodes = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (moveCodes.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    if (keys.current.size === 0) return;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    const move = new THREE.Vector3();

    if (keys.current.has("KeyW") || keys.current.has("ArrowUp")) move.add(forward);
    if (keys.current.has("KeyS") || keys.current.has("ArrowDown")) move.sub(forward);
    if (keys.current.has("KeyD") || keys.current.has("ArrowRight")) move.add(right);
    if (keys.current.has("KeyA") || keys.current.has("ArrowLeft")) move.sub(right);

    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(speed * delta);

    camera.position.add(move);

    // Keep OrbitControls target in sync
    const controls = controlsRef.current as unknown as { target: THREE.Vector3 };
    if (controls?.target) {
      controls.target.add(move);
    }
  });

  return null;
}

export default function SceneWrapper({
  children,
  cameraPosition = [0, 2, 8],
  cameraTarget,
  autoRotate = true,
  autoRotateSpeed = 0.3,
  height,
}: SceneWrapperProps) {
  const [ready, setReady] = useState(false);
  const orbitRef = useRef<any>(null);

  return (
    <Box
      w="100%"
      h={height ?? { base: "50vh", md: "60vh" }}
      borderRadius="8px"
      overflow="hidden"
      border="1px solid"
      borderColor="brand.300/10"
      bg="dark.900"
      position="relative"
    >
      {/* Loading overlay — shown until scene children mount */}
      {!ready && (
        <Box
          position="absolute"
          inset={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          zIndex={2}
          bg="dark.900"
        >
          <motion.div
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Text
              color="dark.300"
              fontSize="xs"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontStyle="italic"
            >
              Загрузка 3D...
            </Text>
          </motion.div>
        </Box>
      )}

      <Canvas
        camera={{ position: cameraPosition, fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "linear-gradient(180deg, #0c0c14 0%, #08080f 100%)" }}
      >
        <Suspense fallback={null}>
          {/* Ambient gold light */}
          <ambientLight intensity={0.15} color="#c9a84c" />
          <ambientLight intensity={0.1} color="#ffffff" />

          {/* Main directional light */}
          <directionalLight
            position={[5, 8, 5]}
            intensity={0.6}
            color="#f5e6c8"
            castShadow
          />

          {/* Accent point lights */}
          <pointLight position={[-3, 4, -2]} intensity={0.3} color="#c9a84c" distance={15} />
          <pointLight position={[3, 2, 4]} intensity={0.2} color="#dcc48a" distance={12} />

          {/* Fog for depth */}
          <fog attach="fog" args={["#08080f", 8, 25]} />

          {children}

          <SceneReadyDetector onReady={() => setReady(true)} />

          <KeyboardMovement controlsRef={orbitRef} />

          <OrbitControls
            ref={orbitRef}
            autoRotate={autoRotate}
            autoRotateSpeed={autoRotateSpeed}
            enableZoom={true}
            enablePan={true}
            minDistance={2}
            maxDistance={15}
            maxPolarAngle={Math.PI / 1.8}
            minPolarAngle={Math.PI / 6}
            {...(cameraTarget ? { target: cameraTarget } : {})}
          />
        </Suspense>
      </Canvas>
    </Box>
  );
}
