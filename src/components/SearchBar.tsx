"use client";

import { useState } from "react";
import { Box, Input, Flex, Button, Spinner } from "@chakra-ui/react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

type SearchMode = "search" | "search-exactly" | "search-title";


export default function SearchBar() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<SearchMode>("search");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSearch = async (overrideMode?: SearchMode) => {
    if (!text.trim()) return;
    const activeMode = overrideMode ?? mode;
    setLoading(true);
    try {
      const endpoint = `/api/${activeMode}`;
      const body =
        activeMode === "search-title" ? { title: text } : { text };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.address) {
        const q = encodeURIComponent(text);
        router.push(`/page/${encodeURIComponent(data.address)}?q=${q}`);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const modes: { key: SearchMode; label: string }[] = [
    { key: "search", label: "Поиск" },
    { key: "search-exactly", label: "Точный" },
    { key: "search-title", label: "Заголовок" },
  ];

  return (
    <Box w="100%" maxW="640px" mx="auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Box position="relative">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Введите текст для поиска..."
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
            size="lg"
            fontFamily="var(--font-jetbrains), monospace"
            fontSize="sm"
            fontWeight="300"
            letterSpacing="0.02em"
            borderRadius="8px"
            py={6}
            transition="all 0.3s ease"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </Box>
      </motion.div>

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
                  if (text.trim()) handleSearch(m.key);
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
