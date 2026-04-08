"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Flex, Heading, Link as ChakraLink, Button, Spinner, Text } from "@chakra-ui/react";
import { motion } from "framer-motion";
import NextLink from "next/link";
import { fadeIn } from "@/lib/animations";

const MotionFlex = motion.create(Flex);

export default function Header() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRandom = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/random");
      const data = await res.json();
      if (data.address) {
        router.push(`/page/${encodeURIComponent(data.address)}`);
      }
    } catch (err) {
      console.error("Random page error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={100}
      bg="rgba(8, 8, 15, 0.8)"
      backdropFilter="blur(16px)"
      borderBottom="1px solid"
      borderColor="brand.300/10"
    >
      <Box className="glow-line" />
      <MotionFlex
        maxW="1200px"
        mx="auto"
        align="center"
        justify="space-between"
        px={6}
        py={4}
        variants={fadeIn}
        initial="hidden"
        animate="visible"
      >
        <ChakraLink asChild _hover={{ textDecoration: "none" }}>
          <NextLink href="/">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <Flex align="baseline" gap={3}>
                <Heading
                  size="lg"
                  color="brand.300"
                  fontFamily="var(--font-cormorant), Georgia, serif"
                  fontWeight="600"
                  letterSpacing="0.08em"
                >
                  Вавилонская Библиотека
                </Heading>
                <Text
                  color="brand.300/30"
                  fontSize="xs"
                  fontFamily="var(--font-jetbrains), monospace"
                  fontWeight="300"
                >
                  v.∞
                </Text>
              </Flex>
            </motion.div>
          </NextLink>
        </ChakraLink>

        <Flex gap={1} align="center">
          {[
            { href: "/", label: "Поиск" },
            { href: "/browse", label: "Обзор" },
          ].map((link) => (
            <ChakraLink
              key={link.href}
              asChild
              color="dark.200"
              fontSize="sm"
              fontWeight="400"
              letterSpacing="0.05em"
              px={3}
              py={1}
              borderRadius="4px"
              transition="all 0.2s ease"
              _hover={{
                color: "brand.300",
                bg: "brand.300/5",
              }}
            >
              <NextLink href={link.href}>
                <motion.span
                  whileHover={{ y: -1 }}
                  transition={{ duration: 0.15 }}
                >
                  {link.label}
                </motion.span>
              </NextLink>
            </ChakraLink>
          ))}
          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={handleRandom}
              bg="transparent"
              color="dark.200"
              fontSize="sm"
              fontWeight="400"
              letterSpacing="0.05em"
              variant="plain"
              disabled={loading}
              px={3}
              py={1}
              minW="auto"
              h="auto"
              borderRadius="4px"
              transition="all 0.2s ease"
              _hover={{
                color: "brand.300",
                bg: "brand.300/5",
              }}
            >
              {loading ? <Spinner size="sm" color="brand.300" /> : "Случайная"}
            </Button>
          </motion.div>
        </Flex>
      </MotionFlex>
    </Box>
  );
}
