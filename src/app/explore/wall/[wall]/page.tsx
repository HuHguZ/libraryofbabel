"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Box, VStack, Text, Link as ChakraLink } from "@chakra-ui/react";
import { motion } from "framer-motion";
import NextLink from "next/link";
import PageTransition from "@/components/PageTransition";
import AnimatedOrnament from "@/components/AnimatedOrnament";
import SceneLoadingFallback from "@/components/SceneLoadingFallback";
import { fadeInUp, stagger, slideInLeft } from "@/lib/animations";
import { generateRandomHex } from "@/lib/hex";

const SceneWrapper = dynamic(() => import("@/components/explore/SceneWrapper"), {
  ssr: false,
  loading: () => <SceneLoadingFallback />,
});
const HexGalleryScene = dynamic(() => import("@/components/explore/HexGalleryScene"), {
  ssr: false,
});

const MotionBox = motion.create(Box);
const MotionVStack = motion.create(VStack);

export default function WallExplorePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawWall = Number(params.wall);
  const wall = Math.max(1, Math.min(5, isNaN(rawWall) ? 1 : rawWall));

  const hexFromUrl = searchParams.get("hex");
  const [hex] = useState(() => hexFromUrl || generateRandomHex(4819));

  // Camera inside the hex, looking at the active wall
  const { cameraPosition, cameraTarget } = useMemo(() => {
    const wallIndex = wall - 1; // 0-based
    const angle = (wallIndex / 6) * Math.PI * 2 + Math.PI / 6;
    const wallX = Math.cos(angle) * 4;
    const wallZ = Math.sin(angle) * 4;
    // Position camera on the opposite side of center from the wall, so the full wall is visible
    const camX = -Math.cos(angle) * 1.2;
    const camZ = -Math.sin(angle) * 1.2;
    return {
      cameraPosition: [camX, 0.5, camZ] as [number, number, number],
      cameraTarget: [wallX, 0, wallZ] as [number, number, number],
    };
  }, [wall]);

  const handleShelfClick = (shelf: number) => {
    router.push(`/explore/wall/${wall}/shelf/${shelf}?hex=${encodeURIComponent(hex)}`);
  };

  const handleVolumeClick = (shelf: number, volume: number) => {
    router.push(`/explore/wall/${wall}/shelf/${shelf}/volume/${volume}?hex=${encodeURIComponent(hex)}`);
  };

  return (
    <PageTransition>
      <Box maxW="1000px" mx="auto" px={4} py={8}>
        <MotionVStack
          gap={8}
          align="stretch"
          variants={stagger(0.12)}
          initial="hidden"
          animate="visible"
        >
          {/* Back link */}
          <MotionBox variants={slideInLeft}>
            <ChakraLink
              asChild
              color="dark.300"
              fontSize="sm"
              fontFamily="var(--font-jetbrains), monospace"
              fontWeight="300"
              letterSpacing="0.02em"
              transition="color 0.2s ease"
              _hover={{ color: "brand.300", textDecoration: "none" }}
            >
              <NextLink href="/">
                <motion.span
                  whileHover={{ x: -4 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: "inline-block" }}
                >
                  ← на главную
                </motion.span>
              </NextLink>
            </ChakraLink>
          </MotionBox>

          {/* Title */}
          <MotionBox textAlign="center" variants={fadeInUp}>
            <Text
              color="dark.300"
              fontSize="10px"
              textTransform="uppercase"
              letterSpacing="0.15em"
              fontFamily="var(--font-jetbrains), monospace"
              fontWeight="500"
              mb={2}
            >
              Шестигранная галерея
            </Text>
            <Text
              fontSize={{ base: "2xl", md: "3xl" }}
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="500"
              letterSpacing="0.04em"
            >
              Стена {wall}
            </Text>
            <Box mt={3}>
              <AnimatedOrnament />
            </Box>
          </MotionBox>

          {/* 3D Scene */}
          <MotionBox variants={fadeInUp}>
            <SceneWrapper cameraPosition={cameraPosition} cameraTarget={cameraTarget} autoRotate={false}>
              <HexGalleryScene activeWall={wall} onShelfClick={handleShelfClick} onVolumeClick={handleVolumeClick} />
            </SceneWrapper>
          </MotionBox>

          {/* Instruction */}
          <MotionBox textAlign="center" variants={fadeInUp}>
            <Text
              color="dark.300"
              fontSize="sm"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontStyle="italic"
              lineHeight="1.7"
            >
              Нажмите на книгу, чтобы перейти к тому, или на полку — чтобы увидеть все тома.
              Вращайте камеру мышью для осмотра галереи.
            </Text>
          </MotionBox>

          {/* Wall selector */}
          <MotionBox variants={fadeInUp}>
            <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
              {Array.from({ length: 5 }, (_, i) => (
                <motion.div
                  key={i}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ChakraLink asChild _hover={{ textDecoration: "none" }}>
                    <NextLink href={`/explore/wall/${i + 1}?hex=${encodeURIComponent(hex)}`}>
                      <Box
                        px={4}
                        py={2}
                        borderRadius="6px"
                        bg={wall === i + 1 ? "brand.300/12" : "transparent"}
                        border="1px solid"
                        borderColor={wall === i + 1 ? "brand.300/30" : "dark.400/30"}
                        cursor="pointer"
                        transition="all 0.2s ease"
                        _hover={{
                          bg: "brand.300/8",
                          borderColor: "brand.300/25",
                        }}
                      >
                        <Text
                          color={wall === i + 1 ? "brand.300" : "dark.200"}
                          fontSize="sm"
                          fontFamily="var(--font-jetbrains), monospace"
                          fontWeight="400"
                        >
                          Стена {i + 1}
                        </Text>
                      </Box>
                    </NextLink>
                  </ChakraLink>
                </motion.div>
              ))}
            </Box>
          </MotionBox>
        </MotionVStack>
      </Box>
    </PageTransition>
  );
}
