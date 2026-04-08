"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Box, VStack, Heading, Text, Spinner, Link as ChakraLink } from "@chakra-ui/react";
import NextLink from "next/link";
import BookPage from "@/components/BookPage";
import LibraryNav from "@/components/LibraryNav";
import AddressDisplay from "@/components/AddressDisplay";

export default function PageView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const address = decodeURIComponent(params.address as string);
  const searchQuery = searchParams.get("q") ?? "";

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState({ wall: 0, shelf: 0, volume: 0, page: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [pageRes, titleRes] = await Promise.all([
          fetch("/api/page", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address }),
          }),
          fetch("/api/title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address }),
          }),
        ]);
        const pageData = await pageRes.json();
        const titleData = await titleRes.json();
        setContent(pageData.content || "");
        setLocation({
          wall: pageData.wall,
          shelf: pageData.shelf,
          volume: pageData.volume,
          page: pageData.page,
        });
        setTitle(titleData.title || "");
      } catch (err) {
        console.error("Failed to load page:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [address]);

  if (loading) {
    return (
      <Box minH="60vh" display="flex" alignItems="center" justifyContent="center">
        <VStack gap={4}>
          <Spinner size="xl" color="brand.400" />
          <Text color="dark.300">Загрузка страницы...</Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box maxW="1000px" mx="auto" px={4} py={8}>
      <VStack gap={6} align="stretch">
        {/* Back link */}
        <ChakraLink asChild color="brand.400" fontSize="sm" _hover={{ color: "brand.300" }}>
          <NextLink href="/">← Вернуться к поиску</NextLink>
        </ChakraLink>

        {/* Title */}
        <Box textAlign="center">
          <Text color="dark.300" fontSize="xs" textTransform="uppercase" letterSpacing="0.1em" mb={1}>
            Заголовок
          </Text>
          <Heading
            as="h2"
            size="lg"
            color="parchment.200"
            fontFamily="'Playfair Display', Georgia, serif"
            fontWeight="600"
          >
            {title}
          </Heading>
        </Box>

        {/* Location */}
        <LibraryNav
          wall={location.wall}
          shelf={location.shelf}
          volume={location.volume}
          page={location.page}
        />

        {/* Page content */}
        <BookPage content={content} highlight={searchQuery} />

        {/* Address */}
        <AddressDisplay address={address} />
      </VStack>
    </Box>
  );
}
