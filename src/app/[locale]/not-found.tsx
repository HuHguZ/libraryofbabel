"use client";

import { Box, Text, VStack } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import AnimatedOrnament from "@/components/AnimatedOrnament";
import { Link } from "@/i18n/navigation";

const serif = "var(--font-cormorant), Georgia, serif";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <Box minH="70vh" display="flex" alignItems="center" justifyContent="center" px={4} py={20}>
      <VStack gap={5} maxW="560px" textAlign="center">
        <Text color="dark.300" fontSize="11px" letterSpacing="0.4em" fontFamily="var(--font-jetbrains), monospace">
          404
        </Text>
        <Text color="brand.300" fontSize={{ base: "2xl", md: "3xl" }} fontFamily={serif} letterSpacing="0.03em">
          {t("title")}
        </Text>
        <AnimatedOrnament />
        <Text color="dark.100" fontFamily={serif} fontStyle="italic" fontSize="lg">
          {t("text")}
        </Text>
        <Link href="/" style={{ textDecoration: "none" }}>
          <Text color="dark.200" fontSize="sm" letterSpacing="0.05em" _hover={{ color: "brand.300" }} transition="color 0.2s ease">
            ← {t("home")}
          </Text>
        </Link>
      </VStack>
    </Box>
  );
}
