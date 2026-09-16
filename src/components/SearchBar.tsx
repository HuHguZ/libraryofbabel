"use client";

import { useMemo, useState } from "react";
import { Box, Textarea, Flex, Button, Spinner, Text } from "@chakra-ui/react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { foreignSymbols, normalizeQuery } from "@/lib/alphabet";

type SearchMode = "search" | "search-exactly" | "search-title";

const serif = "var(--font-cormorant), Georgia, serif";
const mono = "var(--font-jetbrains), monospace";
/** How much of a long query the hint under the field repeats. */
const PREVIEW = 140;

export default function SearchBar() {
  const t = useTranslations("SearchBar");
  const locale = useLocale();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<SearchMode>("search");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const router = useRouter();

  // The Library has its own alphabet; show what will actually be looked for when the phrase has other symbols.
  const normalized = useMemo(() => normalizeQuery(text, locale).trim(), [text, locale]);
  const foreign = useMemo(() => foreignSymbols(text, locale), [text, locale]);
  const changed = text.trim() !== "" && normalized !== text.trim();
  const preview = normalized.length > PREVIEW ? `${normalized.slice(0, PREVIEW)}…` : normalized;

  const handleSearch = async (overrideMode?: SearchMode) => {
    if (!normalized) return;
    const activeMode = overrideMode ?? mode;
    setLoading(true);
    try {
      const endpoint = `/api/${activeMode}`;
      const body = activeMode === "search-title" ? { title: normalized, lang: locale } : { text: normalized, lang: locale };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { address?: string; query?: string };
      if (data.address) {
        const q = encodeURIComponent(data.query ?? normalized);
        router.push(`/page/${encodeURIComponent(data.address)}?q=${q}`);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const modes: { key: SearchMode; label: string }[] = [
    { key: "search", label: t("modeSearch") },
    { key: "search-exactly", label: t("modeExact") },
    { key: "search-title", label: t("modeTitle") },
  ];

  return (
    <Box w="100%" maxW="640px" mx="auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Box position="relative">
          {/* Several lines: the Library keeps line breaks, so a poem or a piece of code is found as it is laid out. */}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("placeholder")}
            autoresize
            rows={1}
            maxH="16lh"
            overflowY="auto"
            resize="none"
            spellCheck={false}
            enterKeyHint="search"
            bg="dark.700"
            border="1px solid"
            borderColor="brand.300/15"
            color="parchment.200"
            _placeholder={{ color: "dark.300" }}
            _hover={{ borderColor: "brand.300/30" }}
            _focus={{
              borderColor: "brand.300/60",
              boxShadow: "0 0 0 1px rgba(201, 168, 76, 0.15), 0 0 20px rgba(201, 168, 76, 0.05)",
            }}
            fontFamily={mono}
            fontSize="sm"
            fontWeight="300"
            letterSpacing="0.02em"
            lineHeight="1.6"
            borderRadius="8px"
            px={4}
            py="15px"
            transition="border-color 0.3s ease, box-shadow 0.3s ease"
            onKeyDown={(e) => {
              // Enter searches; Shift+Enter starts a new line (and a composing IME keeps its Enter).
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              handleSearch();
            }}
          />
        </Box>
        <Text
          color="dark.300"
          fontSize="10px"
          fontFamily={mono}
          letterSpacing="0.05em"
          textAlign="right"
          mt={1.5}
          display={{ base: "none", md: "block" }}
          opacity={focused || text.includes("\n") ? 1 : 0}
          transition="opacity 0.25s ease"
          aria-hidden
        >
          {t("keysHint")}
        </Text>
      </motion.div>

      <AnimatePresence>
        {changed && (
          <motion.div
            key="hint"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            <Text color="dark.100" fontSize="sm" fontFamily={serif} fontStyle="italic" textAlign="center" mt={3} lineHeight="1.5">
              {t("alphabetHint")}
              {foreign.length > 0 &&
                t.rich("foreign", {
                  symbols: foreign.slice(0, 8).join(" "),
                  mark: (chunks) => (
                    <Box as="span" fontFamily="var(--font-jetbrains), monospace" fontStyle="normal" color="brand.200">
                      {chunks}
                    </Box>
                  ),
                })}
              .{" "}
              {normalized
                ? t.rich("willSearch", {
                    query: preview,
                    phrase: (chunks) => (
                      <Box as="span" color="brand.300" fontStyle="normal">
                        {chunks}
                      </Box>
                    ),
                  })
                : t("typeInAlphabet")}
            </Text>
          </motion.div>
        )}
      </AnimatePresence>

      <Flex gap={2} justify="center" mt={4}>
        {modes.map((m, i) => (
          <motion.div
            key={m.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
          >
            <motion.div
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.96 }}
            >
              <Button
                onClick={() => {
                  setMode(m.key);
                  if (normalized) handleSearch(m.key);
                }}
                bg={mode === m.key ? "brand.300/12" : "transparent"}
                color={mode === m.key ? "brand.300" : "dark.200"}
                border="1px solid"
                borderColor={mode === m.key ? "brand.300/30" : "dark.400/50"}
                borderRadius="6px"
                _hover={{
                  bg: mode === m.key ? "brand.300/18" : "dark.400/20",
                  borderColor: mode === m.key ? "brand.300/40" : "dark.300/30",
                }}
                fontWeight="400"
                fontSize="sm"
                letterSpacing="0.03em"
                size="sm"
                px={5}
                transition="background 0.2s ease, border-color 0.2s ease, color 0.2s ease"
                disabled={loading}
              >
                {loading && mode === m.key ? <Spinner size="sm" mr={2} /> : null}
                {m.label}
              </Button>
            </motion.div>
          </motion.div>
        ))}
      </Flex>
    </Box>
  );
}
