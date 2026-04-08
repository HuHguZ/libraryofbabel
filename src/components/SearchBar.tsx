"use client";

import { useState } from "react";
import { Box, Input, Flex, Button, Spinner } from "@chakra-ui/react";
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
    { key: "search-exactly", label: "Точный поиск" },
    { key: "search-title", label: "По заголовку" },
  ];

  return (
    <Box w="100%" maxW="700px" mx="auto">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Введите текст для поиска..."
        bg="dark.500"
        border="1px solid"
        borderColor="brand.400/27"
        color="parchment.200"
        _placeholder={{ color: "dark.300" }}
        _hover={{ borderColor: "brand.400/53" }}
        _focus={{
          borderColor: "brand.400",
          boxShadow: "0 0 0 1px var(--chakra-colors-brand-400)",
        }}
        size="lg"
        fontFamily="'Courier New', monospace"
        mb={4}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
      />
      <Flex gap={3} justify="center" wrap="wrap">
        {modes.map((m) => (
          <Button
            key={m.key}
            onClick={() => {
              setMode(m.key);
              if (text.trim()) handleSearch(m.key);
            }}
            bg={mode === m.key ? "brand.400" : "transparent"}
            color={mode === m.key ? "dark.900" : "brand.400"}
            border="1px solid"
            borderColor="brand.400"
            _hover={{
              bg: mode === m.key ? "brand.300" : "brand.400/13",
            }}
            fontWeight="600"
            size="md"
            disabled={loading}
          >
            {loading && mode === m.key ? <Spinner size="sm" mr={2} /> : null}
            {m.label}
          </Button>
        ))}
      </Flex>
    </Box>
  );
}
