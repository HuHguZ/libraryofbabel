"use client";

import { Box, Flex, Text } from "@chakra-ui/react";

interface LibraryNavProps {
  wall: number;
  shelf: number;
  volume: number;
  page: number;
}

export default function LibraryNav({ wall, shelf, volume, page }: LibraryNavProps) {
  const items = [
    { label: "Стена", value: wall },
    { label: "Полка", value: shelf },
    { label: "Том", value: volume },
    { label: "Страница", value: page },
  ];

  return (
    <Flex
      gap={{ base: 3, md: 6 }}
      justify="center"
      wrap="wrap"
      py={3}
    >
      {items.map((item) => (
        <Box key={item.label} textAlign="center">
          <Text
            color="dark.300"
            fontSize="xs"
            fontWeight="600"
            textTransform="uppercase"
            letterSpacing="0.1em"
          >
            {item.label}
          </Text>
          <Text
            color="brand.300"
            fontSize="xl"
            fontWeight="700"
            fontFamily="'Playfair Display', Georgia, serif"
          >
            {item.value}
          </Text>
        </Box>
      ))}
    </Flex>
  );
}
