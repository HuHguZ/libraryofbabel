"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Box } from "@chakra-ui/react";
import { ReactNode, Suspense } from "react";

interface SceneWrapperProps {
  children: ReactNode;
  cameraPosition?: [number, number, number];
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  height?: Record<string, string> | string;
}

export default function SceneWrapper({
  children,
  cameraPosition = [0, 2, 8],
  autoRotate = true,
  autoRotateSpeed = 0.3,
  height,
}: SceneWrapperProps) {
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

          <OrbitControls
            autoRotate={autoRotate}
            autoRotateSpeed={autoRotateSpeed}
            enableZoom={true}
            enablePan={true}
            minDistance={2}
            maxDistance={15}
            maxPolarAngle={Math.PI / 1.8}
            minPolarAngle={Math.PI / 6}
          />
        </Suspense>
      </Canvas>
    </Box>
  );
}
