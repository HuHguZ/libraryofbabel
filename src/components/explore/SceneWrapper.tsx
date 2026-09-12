"use client";

import { Canvas, events as defaultEvents, type RootState } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Box, Text } from "@chakra-ui/react";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import * as THREE from "three";
import { LibraryMaterialsProvider } from "./materials";
import { isCenterAim } from "./cursor";

interface SceneWrapperProps {
  children: ReactNode;
  /** Gallery seed: picks textures and binding colours. */
  seed?: number;
  /** Bloom + vignette post-processing (on by default). */
  post?: boolean;
  onReady?: () => void;
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

/**
 * Pointer events like the defaults, except that a captured mouse (shooter-style look, real pointer
 * lock or the free-mouse fallback) always aims at the centre of the screen, where the reticle is.
 */
const sceneEvents = (store: Parameters<typeof defaultEvents>[0]) => {
  const base = defaultEvents(store);
  return {
    ...base,
    compute(event: MouseEvent, state: RootState) {
      const canvas = state.gl.domElement;
      if ((typeof document !== "undefined" && document.pointerLockElement === canvas) || isCenterAim(canvas)) {
        state.pointer.set(0, 0);
      } else {
        state.pointer.set((event.offsetX / state.size.width) * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1);
      }
      state.raycaster.setFromCamera(state.pointer, state.camera);
    },
  };
};

/**
 * Full-bleed WebGL stage. Textures and materials are provided to every scene,
 * and a loading veil is shown until the scene has actually mounted.
 */
export default function SceneWrapper({ children, seed = 0, post = true, onReady }: SceneWrapperProps) {
  const [ready, setReady] = useState(false);

  return (
    <Box position="absolute" inset={0} bg="#07060a">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
        camera={{ fov: 58, near: 0.05, far: 80, position: [0, 1.6, 0] }}
        events={sceneEvents}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <color attach="background" args={["#07060a"]} />
        <Suspense fallback={null}>
          <LibraryMaterialsProvider seed={seed}>
            {children}
            <ReadySignal
              onReady={() => {
                setReady(true);
                onReady?.();
              }}
            />
          </LibraryMaterialsProvider>
          {post && (
            <EffectComposer multisampling={4}>
              <Bloom mipmapBlur luminanceThreshold={0.82} luminanceSmoothing={0.3} intensity={0.85} radius={0.55} />
              <Vignette eskil={false} offset={0.22} darkness={0.72} />
            </EffectComposer>
          )}
        </Suspense>
      </Canvas>

      <AnimatePresence>
        {!ready && (
          <motion.div
            key="veil"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.9, ease: "easeOut" } }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#07060a",
              zIndex: 3,
              pointerEvents: "none",
            }}
          >
            <motion.div animate={{ opacity: [0.35, 0.9, 0.35] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}>
              <Text color="dark.100" fontSize="sm" fontFamily="var(--font-cormorant), Georgia, serif" fontStyle="italic" letterSpacing="0.08em">
                Лампы разгораются…
              </Text>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}
