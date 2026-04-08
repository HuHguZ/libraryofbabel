"use client";

import { Box, Heading, Text, VStack } from "@chakra-ui/react";
import SearchBar from "@/components/SearchBar";

export default function Home() {
  return (
    <Box
      minH="80vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={4}
      py={16}
    >
      <VStack gap={10} maxW="800px" textAlign="center">
        {/* Hero */}
        <VStack gap={4}>
          <Text
            color="brand.400/27"
            fontSize="sm"
            fontWeight="600"
            textTransform="uppercase"
            letterSpacing="0.3em"
          >
            Хорхе Луис Борхес
          </Text>
          <Heading
            as="h1"
            size={{ base: "3xl", md: "4xl" }}
            color="brand.400"
            fontFamily="'Playfair Display', Georgia, serif"
            fontWeight="700"
            lineHeight="1.2"
          >
            Вавилонская Библиотека
          </Heading>
          <Box w="60px" h="1px" bg="brand.400/27" />
        </VStack>

        {/* Description */}
        <Text
          color="dark.200"
          fontSize={{ base: "md", md: "lg" }}
          lineHeight="1.8"
          maxW="600px"
          fontStyle="italic"
        >
          Вселенная — некоторые называют её Библиотекой — состоит из
          огромного, возможно бесконечного числа шестигранных галерей.
          Библиотека содержит все возможные книги — каждую комбинацию
          символов, которую только можно составить.
        </Text>

        {/* Search */}
        <SearchBar />

        {/* Stats */}
        <Box
          display="flex"
          gap={{ base: 4, md: 8 }}
          flexWrap="wrap"
          justifyContent="center"
          pt={4}
        >
          {[
            { value: "5", label: "стен" },
            { value: "7", label: "полок" },
            { value: "31", label: "том" },
            { value: "421", label: "страница" },
            { value: "4 819", label: "символов на странице" },
          ].map((stat) => (
            <VStack key={stat.label} gap={0}>
              <Text
                color="brand.300"
                fontSize="2xl"
                fontWeight="700"
                fontFamily="'Playfair Display', Georgia, serif"
              >
                {stat.value}
              </Text>
              <Text color="dark.300" fontSize="xs" textTransform="uppercase" letterSpacing="0.1em">
                {stat.label}
              </Text>
            </VStack>
          ))}
        </Box>
      </VStack>
    </Box>
  );
}
