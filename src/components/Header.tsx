"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box, Flex, Heading, Link as ChakraLink, Button, Spinner, Text } from "@chakra-ui/react";
import { motion } from "motion/react";
import { Link, useRouter } from "@/i18n/navigation";
import LanguageSwitch from "@/components/LanguageSwitch";
import { fadeIn } from "@/lib/animations";

const MotionFlex = motion.create(Flex);

export default function Header() {
  const t = useTranslations("Header");
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
      h="var(--header-h)"
    >
      <Box className="glow-line" />
      <MotionFlex
        maxW="1200px"
        mx="auto"
        h="100%"
        align="center"
        justify="space-between"
        px={{ base: 4, md: 6 }}
        variants={fadeIn}
        initial="hidden"
        animate="visible"
      >
        <ChakraLink asChild _hover={{ textDecoration: "none" }}>
          <Link href="/">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <Flex align="baseline" gap={3}>
                <Heading
                  size={{ base: "md", md: "lg" }}
                  color="brand.300"
                  fontFamily="var(--font-cormorant), Georgia, serif"
                  fontWeight="600"
                  letterSpacing="0.08em"
                  whiteSpace="nowrap"
                >
                  <Box as="span" display={{ base: "none", sm: "inline" }}>{t("titleLead")}</Box>{t("titleMain")}
                </Heading>
                <Text
                  color="brand.300/30"
                  fontSize="xs"
                  fontFamily="var(--font-jetbrains), monospace"
                  fontWeight="300"
                  display={{ base: "none", md: "block" }}
                >
                  v.∞
                </Text>
              </Flex>
            </motion.div>
          </Link>
        </ChakraLink>

        <Flex gap={{ base: 0, sm: 1 }} align="center">
          {[
            { href: "/", label: t("search") },
            { href: "/browse", label: t("browse") },
          ].map((link) => (
            <ChakraLink
              key={link.href}
              asChild
              color="dark.200"
              fontSize={{ base: "xs", sm: "sm" }}
              fontWeight="400"
              letterSpacing="0.05em"
              px={{ base: 1.5, sm: 3 }}
              py={1}
              borderRadius="4px"
              transition="all 0.2s ease"
              _hover={{
                color: "brand.300",
                bg: "brand.300/5",
              }}
            >
              <Link href={link.href}>
                <motion.span
                  whileHover={{ y: -1 }}
                  transition={{ duration: 0.15 }}
                >
                  {link.label}
                </motion.span>
              </Link>
            </ChakraLink>
          ))}
          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={handleRandom}
              bg="transparent"
              color="dark.200"
              fontSize={{ base: "xs", sm: "sm" }}
              fontWeight="400"
              letterSpacing="0.05em"
              variant="plain"
              disabled={loading}
              px={{ base: 1.5, sm: 3 }}
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
              {loading ? <Spinner size="sm" color="brand.300" /> : t("random")}
            </Button>
          </motion.div>
          <Box w="1px" h="16px" bg="brand.300/15" mx={{ base: 1, sm: 2 }} />
          <LanguageSwitch />
        </Flex>
      </MotionFlex>
    </Box>
  );
}
