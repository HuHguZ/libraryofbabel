"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
const BookshelfScene = dynamic(() => import("@/components/explore/BookshelfScene"), {
  ssr: false,
});

const MotionBox = motion.create(Box);
const MotionVStack = motion.create(VStack);

export default function ShelfExplorePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawWall = Number(params.wall);
  const rawShelf = Number(params.shelf);
  const wall = Math.max(1, Math.min(5, isNaN(rawWall) ? 1 : rawWall));
  const shelf = Math.max(1, Math.min(7, isNaN(rawShelf) ? 1 : rawShelf));

  const hexFromUrl = searchParams.get("hex");
  const [hex] = useState(() => hexFromUrl || generateRandomHex(4819));

  const handleVolumeClick = (volume: number) => {
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
              <NextLink href={`/explore/wall/${wall}?hex=${encodeURIComponent(hex)}`}>
                <motion.span
                  whileHover={{ x: -4 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: "inline-block" }}
                >
                  ← стена {wall}
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
              Книжная полка
            </Text>
            <Text
              fontSize={{ base: "2xl", md: "3xl" }}
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="500"
              letterSpacing="0.04em"
            >
              Стена {wall} · Полка {shelf}
            </Text>
            <Box mt={3}>
              <AnimatedOrnament />
            </Box>
          </MotionBox>

          {/* 3D Scene */}
          <MotionBox variants={fadeInUp}>
            <SceneWrapper cameraPosition={[0, 0.5, 8]} autoRotateSpeed={0.15}>
              <BookshelfScene wall={wall} shelf={shelf} onVolumeClick={handleVolumeClick} />
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
              Нажмите на том, чтобы увидеть его страницы.
              На этой полке 31 том.
            </Text>
          </MotionBox>

          {/* Shelf selector */}
          <MotionBox variants={fadeInUp}>
            <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
              {Array.from({ length: 7 }, (_, i) => (
                <motion.div
                  key={i}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ChakraLink asChild _hover={{ textDecoration: "none" }}>
                    <NextLink href={`/explore/wall/${wall}/shelf/${i + 1}?hex=${encodeURIComponent(hex)}`}>
                      <Box
                        px={3}
                        py={2}
                        borderRadius="6px"
                        bg={shelf === i + 1 ? "brand.300/12" : "transparent"}
                        border="1px solid"
                        borderColor={shelf === i + 1 ? "brand.300/30" : "dark.400/30"}
                        cursor="pointer"
                        transition="all 0.2s ease"
                        _hover={{
                          bg: "brand.300/8",
                          borderColor: "brand.300/25",
                        }}
                      >
                        <Text
                          color={shelf === i + 1 ? "brand.300" : "dark.200"}
                          fontSize="sm"
                          fontFamily="var(--font-jetbrains), monospace"
                          fontWeight="400"
                        >
                          {i + 1}
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
