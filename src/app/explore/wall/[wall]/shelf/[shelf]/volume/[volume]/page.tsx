"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
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
  loading: () => <SceneLoadingFallback height={{ base: "65vh", md: "75vh" }} />,
});
const VolumeScene = dynamic(() => import("@/components/explore/VolumeScene"), {
  ssr: false,
});

const MotionBox = motion.create(Box);
const MotionVStack = motion.create(VStack);

export default function VolumeExplorePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawWall = Number(params.wall);
  const rawShelf = Number(params.shelf);
  const rawVolume = Number(params.volume);
  const wall = Math.max(1, Math.min(5, isNaN(rawWall) ? 1 : rawWall));
  const shelf = Math.max(1, Math.min(7, isNaN(rawShelf) ? 1 : rawShelf));
  const volume = Math.max(1, Math.min(31, isNaN(rawVolume) ? 1 : rawVolume));

  const hexFromUrl = searchParams.get("hex");
  const [hex, setHex] = useState(hexFromUrl || "");

  useEffect(() => {
    if (!hexFromUrl) {
      setHex(generateRandomHex(4819));
    }
  }, [hexFromUrl]);

  const handlePageClick = (page: number) => {
    const address = `${hex}-${wall}-${shelf}-${volume}-${page}`;
    router.push(`/page/${encodeURIComponent(address)}`);
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
              <NextLink href={`/explore/wall/${wall}/shelf/${shelf}?hex=${encodeURIComponent(hex)}`}>
                <motion.span
                  whileHover={{ x: -4 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: "inline-block" }}
                >
                  ← полка {shelf}
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
              Открытый том
            </Text>
            <Text
              fontSize={{ base: "2xl", md: "3xl" }}
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="500"
              letterSpacing="0.04em"
            >
              Стена {wall} · Полка {shelf} · Том {volume}
            </Text>
            <Box mt={3}>
              <AnimatedOrnament />
            </Box>
          </MotionBox>

          {/* 3D Scene */}
          <MotionBox variants={fadeInUp}>
            <SceneWrapper key={`volume-${wall}-${shelf}-${volume}`} cameraPosition={[0, 0, 7]} autoRotate={false} height={{ base: "65vh", md: "75vh" }}>
              <VolumeScene
                onPageClick={handlePageClick}
              />
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
              Нажмите на страницу, чтобы открыть её.
              В этом томе 421 страница.
            </Text>
          </MotionBox>

          {/* Breadcrumb navigation */}
          <MotionBox variants={fadeInUp}>
            <Box display="flex" gap={2} justifyContent="center" alignItems="center" flexWrap="wrap">
              <ChakraLink asChild _hover={{ textDecoration: "none" }}>
                <NextLink href={`/explore/wall/${wall}?hex=${encodeURIComponent(hex)}`}>
                  <Text
                    color="dark.300"
                    fontSize="xs"
                    fontFamily="var(--font-jetbrains), monospace"
                    _hover={{ color: "brand.300" }}
                    transition="color 0.2s ease"
                  >
                    Стена {wall}
                  </Text>
                </NextLink>
              </ChakraLink>
              <Text color="dark.400" fontSize="xs">→</Text>
              <ChakraLink asChild _hover={{ textDecoration: "none" }}>
                <NextLink href={`/explore/wall/${wall}/shelf/${shelf}?hex=${encodeURIComponent(hex)}`}>
                  <Text
                    color="dark.300"
                    fontSize="xs"
                    fontFamily="var(--font-jetbrains), monospace"
                    _hover={{ color: "brand.300" }}
                    transition="color 0.2s ease"
                  >
                    Полка {shelf}
                  </Text>
                </NextLink>
              </ChakraLink>
              <Text color="dark.400" fontSize="xs">→</Text>
              <Text
                color="brand.300"
                fontSize="xs"
                fontFamily="var(--font-jetbrains), monospace"
              >
                Том {volume}
              </Text>
            </Box>
          </MotionBox>
        </MotionVStack>
      </Box>
    </PageTransition>
  );
}
