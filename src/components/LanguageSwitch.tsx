"use client";

import { useOptimistic, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box, chakra } from "@chakra-ui/react";
import { motion } from "motion/react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/locales";

const mono = "var(--font-jetbrains), monospace";

/**
 * RU | EN toggle with a sliding gilt thumb. The thumb moves at once; the page follows when the
 * other language has loaded. The query string (gallery address, phrase on the page) is kept.
 */
export default function LanguageSwitch() {
  const t = useTranslations("LanguageSwitch");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic<Locale>(locale);

  const select = (next: Locale) => {
    if (next === shown) return;
    startTransition(() => {
      setShown(next);
      router.replace(`${pathname}${window.location.search}`, { locale: next, scroll: false });
    });
  };

  return (
    <Box
      role="group"
      aria-label={t("label")}
      position="relative"
      display="inline-flex"
      alignItems="center"
      p="2px"
      borderRadius="full"
      border="1px solid"
      borderColor="brand.300/20"
      bg="rgba(8, 8, 15, 0.6)"
      boxShadow="inset 0 1px 3px rgba(0, 0, 0, 0.5)"
      opacity={pending ? 0.8 : 1}
      transition="opacity 0.2s ease, border-color 0.2s ease"
      _hover={{ borderColor: "brand.300/35" }}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ x: `${locales.indexOf(shown) * 100}%` }}
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: "calc(50% - 2px)",
          height: 20,
          borderRadius: 999,
          background: "linear-gradient(180deg, rgba(201, 168, 76, 0.32) 0%, rgba(201, 168, 76, 0.12) 100%)",
          border: "1px solid rgba(201, 168, 76, 0.45)",
          boxShadow: "0 0 12px rgba(201, 168, 76, 0.18)",
        }}
      />
      {locales.map((l) => {
        const active = l === shown;
        return (
          <chakra.button
            key={l}
            type="button"
            lang={l}
            aria-label={t(l)}
            aria-pressed={active}
            title={t(l)}
            onClick={() => select(l)}
            position="relative"
            w={{ base: "26px", sm: "30px" }}
            h="20px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg="transparent"
            border="none"
            borderRadius="full"
            cursor={active ? "default" : "pointer"}
            color={active ? "brand.300" : "dark.200"}
            fontFamily={mono}
            fontSize="10px"
            fontWeight={active ? "500" : "400"}
            letterSpacing="0.1em"
            textTransform="uppercase"
            transition="color 0.2s ease"
            _hover={active ? undefined : { color: "parchment.200" }}
            _focusVisible={{ outline: "1px solid", outlineColor: "brand.300/60", outlineOffset: "1px" }}
          >
            {l}
          </chakra.button>
        );
      })}
    </Box>
  );
}
