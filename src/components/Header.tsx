"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Flex, Heading, Link as ChakraLink, Button, Spinner } from "@chakra-ui/react";
import NextLink from "next/link";

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
      bg="dark.900"
      borderBottom="1px solid"
      borderColor="brand.400/20"
      px={6}
      py={4}
    >
      <Flex maxW="1200px" mx="auto" align="center" justify="space-between">
        <ChakraLink asChild _hover={{ textDecoration: "none" }}>
          <NextLink href="/">
            <Heading
              size="lg"
              color="brand.400"
              fontFamily="'Playfair Display', Georgia, serif"
              fontWeight="700"
              letterSpacing="0.05em"
            >
              Вавилонская Библиотека
            </Heading>
          </NextLink>
        </ChakraLink>
        <Flex gap={6}>
          <ChakraLink
            asChild
            color="brand.200"
            _hover={{ color: "brand.300" }}
            fontSize="sm"
            fontWeight="500"
          >
            <NextLink href="/">Поиск</NextLink>
          </ChakraLink>
          <ChakraLink
            asChild
            color="brand.200"
            _hover={{ color: "brand.300" }}
            fontSize="sm"
            fontWeight="500"
          >
            <NextLink href="/browse">Обзор</NextLink>
          </ChakraLink>
          <Button
            onClick={handleRandom}
            bg="transparent"
            color="brand.200"
            _hover={{ color: "brand.300" }}
            fontSize="sm"
            fontWeight="500"
            variant="plain"
            disabled={loading}
            p={0}
            minW="auto"
            h="auto"
          >
            {loading ? <Spinner size="sm" /> : "Случайная страница"}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
