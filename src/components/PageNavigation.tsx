"use client";

import { useRouter } from "next/navigation";
import { Box, Flex, Text } from "@chakra-ui/react";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/animations";

const MotionFlex = motion.create(Flex);

interface PageNavigationProps {
  wall: number;
  shelf: number;
  volume: number;
  page: number;
  addressHex: string;
}

const MAX_WALL = 5;
const MAX_SHELF = 7;
const MAX_VOLUME = 31;
const MAX_PAGE = 421;

function buildAddress(hex: string, w: number, s: number, v: number, p: number) {
  return `${hex}-${w}-${s}-${v}-${p}`;
}

function getPrev(wall: number, shelf: number, volume: number, page: number) {
  if (page > 1) return { wall, shelf, volume, page: page - 1 };
  if (volume > 1) return { wall, shelf, volume: volume - 1, page: MAX_PAGE };
  if (shelf > 1) return { wall, shelf: shelf - 1, volume: MAX_VOLUME, page: MAX_PAGE };
  if (wall > 1) return { wall: wall - 1, shelf: MAX_SHELF, volume: MAX_VOLUME, page: MAX_PAGE };
  return null;
}

function getNext(wall: number, shelf: number, volume: number, page: number) {
  if (page < MAX_PAGE) return { wall, shelf, volume, page: page + 1 };
  if (volume < MAX_VOLUME) return { wall, shelf, volume: volume + 1, page: 1 };
  if (shelf < MAX_SHELF) return { wall, shelf: shelf + 1, volume: 1, page: 1 };
  if (wall < MAX_WALL) return { wall: wall + 1, shelf: 1, volume: 1, page: 1 };
  return null;
}

function formatLocation(loc: { wall: number; shelf: number; volume: number; page: number }) {
  return `${loc.wall}–${loc.shelf}–${loc.volume}–${loc.page}`;
}

export default function PageNavigation({ wall, shelf, volume, page, addressHex }: PageNavigationProps) {
  const router = useRouter();
  const prev = getPrev(wall, shelf, volume, page);
  const next = getNext(wall, shelf, volume, page);

  const navigate = (loc: { wall: number; shelf: number; volume: number; page: number }) => {
    const addr = buildAddress(addressHex, loc.wall, loc.shelf, loc.volume, loc.page);
    router.push(`/page/${encodeURIComponent(addr)}`);
  };

  return (
    <MotionFlex
      justify="space-between"
      align="center"
      maxW="700px"
      mx="auto"
      py={4}
      variants={fadeInUp}
    >
      {/* Previous */}
      {prev ? (
        <motion.div
          whileHover={{ x: -4 }}
          whileTap={{ scale: 0.95 }}
          style={{ cursor: "pointer" }}
          onClick={() => navigate(prev)}
        >
          <Flex align="center" gap={3}>
            <Text
              color="brand.300"
              fontSize={{ base: "xl", md: "2xl" }}
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="400"
              lineHeight="1"
            >
              ←
            </Text>
            <Box>
              <Text
                color="dark.300"
                fontSize="9px"
                textTransform="uppercase"
                letterSpacing="0.12em"
                fontFamily="var(--font-jetbrains), monospace"
                fontWeight="400"
              >
                Предыдущая
              </Text>
              <Text
                color="brand.300/60"
                fontSize="11px"
                fontFamily="var(--font-jetbrains), monospace"
                fontWeight="300"
              >
                {formatLocation(prev)}
              </Text>
            </Box>
          </Flex>
        </motion.div>
      ) : (
        <Box />
      )}

      {/* Page indicator */}
      <Text
        color="dark.400"
        fontSize="10px"
        fontFamily="var(--font-jetbrains), monospace"
        fontWeight="300"
        textAlign="center"
      >
        {page} / {MAX_PAGE}
      </Text>

      {/* Next */}
      {next ? (
        <motion.div
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.95 }}
          style={{ cursor: "pointer" }}
          onClick={() => navigate(next)}
        >
          <Flex align="center" gap={3}>
            <Box textAlign="right">
              <Text
                color="dark.300"
                fontSize="9px"
                textTransform="uppercase"
                letterSpacing="0.12em"
                fontFamily="var(--font-jetbrains), monospace"
                fontWeight="400"
              >
                Следующая
              </Text>
              <Text
                color="brand.300/60"
                fontSize="11px"
                fontFamily="var(--font-jetbrains), monospace"
                fontWeight="300"
              >
                {formatLocation(next)}
              </Text>
            </Box>
            <Text
              color="brand.300"
              fontSize={{ base: "xl", md: "2xl" }}
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="400"
              lineHeight="1"
            >
              →
            </Text>
          </Flex>
        </motion.div>
      ) : (
        <Box />
      )}
    </MotionFlex>
  );
}
