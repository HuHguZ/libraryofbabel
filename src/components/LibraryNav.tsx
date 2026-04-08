"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import { motion } from "framer-motion";
import { counterPop, stagger } from "@/lib/animations";
import NextLink from "next/link";

const MotionFlex = motion.create(Flex);

interface LibraryNavProps {
  wall: number;
  shelf: number;
  volume: number;
  page: number;
  addressHex?: string;
}

export default function LibraryNav({ wall, shelf, volume, page, addressHex }: LibraryNavProps) {
  const hexParam = addressHex ? `?hex=${encodeURIComponent(addressHex)}` : "";
  const items = [
    {
      label: "Стена",
      value: wall,
      href: `/explore/wall/${wall}${hexParam}`,
    },
    {
      label: "Полка",
      value: shelf,
      href: `/explore/wall/${wall}/shelf/${shelf}${hexParam}`,
    },
    {
      label: "Том",
      value: volume,
      href: `/explore/wall/${wall}/shelf/${shelf}/volume/${volume}${hexParam}`,
    },
    {
      label: "Страница",
      value: page,
      href: null,
    },
  ];

  return (
    <MotionFlex
      gap={0}
      justify="center"
      py={2}
      variants={stagger(0.08)}
      initial="hidden"
      animate="visible"
    >
      {items.map((item, i) => (
        <Flex key={item.label} align="center">
          <motion.div variants={counterPop}>
            {item.href ? (
              <NextLink href={item.href} style={{ textDecoration: "none" }}>
                <motion.div
                  whileHover={{ scale: 1.08, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Box
                    textAlign="center"
                    px={{ base: 3, md: 5 }}
                    py={2}
                    borderRadius="8px"
                    cursor="pointer"
                    transition="all 0.2s ease"
                    _hover={{
                      bg: "brand.300/8",
                      boxShadow: "0 0 20px rgba(201, 168, 76, 0.1)",
                    }}
                  >
                    <Text
                      color="dark.300"
                      fontSize="10px"
                      fontWeight="500"
                      textTransform="uppercase"
                      letterSpacing="0.15em"
                      fontFamily="var(--font-jetbrains), monospace"
                      mb={1}
                    >
                      {item.label}
                    </Text>
                    <Text
                      color="brand.300"
                      fontSize={{ base: "xl", md: "2xl" }}
                      fontWeight="500"
                      fontFamily="var(--font-cormorant), Georgia, serif"
                      transition="text-shadow 0.2s ease"
                      _hover={{
                        textShadow: "0 0 12px rgba(201, 168, 76, 0.4)",
                      }}
                    >
                      {item.value}
                    </Text>
                  </Box>
                </motion.div>
              </NextLink>
            ) : (
              <Box textAlign="center" px={{ base: 3, md: 5 }} py={2}>
                <Text
                  color="dark.300"
                  fontSize="10px"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.15em"
                  fontFamily="var(--font-jetbrains), monospace"
                  mb={1}
                >
                  {item.label}
                </Text>
                <Text
                  color="brand.300"
                  fontSize={{ base: "xl", md: "2xl" }}
                  fontWeight="500"
                  fontFamily="var(--font-cormorant), Georgia, serif"
                >
                  {item.value}
                </Text>
              </Box>
            )}
          </motion.div>
          {i < items.length - 1 && (
            <motion.div
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
            >
              <Box
                w="1px"
                h="28px"
                bg="brand.300/12"
              />
            </motion.div>
          )}
        </Flex>
      ))}
    </MotionFlex>
  );
}
