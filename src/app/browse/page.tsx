"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, VStack, Heading, Text, Button, Flex } from "@chakra-ui/react";

function NumberSelector({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <VStack gap={2}>
      <Text color="dark.300" fontSize="xs" fontWeight="600" textTransform="uppercase" letterSpacing="0.1em">
        {label}
      </Text>
      <Flex align="center" gap={2}>
        <Button
          size="sm"
          onClick={() => onChange(Math.max(min, value - 1))}
          bg="transparent"
          color="brand.400"
          border="1px solid"
          borderColor="brand.400/27"
          _hover={{ bg: "brand.400/13" }}
          disabled={value <= min}
        >
          −
        </Button>
        <Text
          color="brand.300"
          fontSize="2xl"
          fontWeight="700"
          fontFamily="'Playfair Display', Georgia, serif"
          minW="50px"
          textAlign="center"
        >
          {value}
        </Text>
        <Button
          size="sm"
          onClick={() => onChange(Math.min(max, value + 1))}
          bg="transparent"
          color="brand.400"
          border="1px solid"
          borderColor="brand.400/27"
          _hover={{ bg: "brand.400/13" }}
          disabled={value >= max}
        >
          +
        </Button>
      </Flex>
      <Text color="dark.400" fontSize="xs">
        {min}–{max}
      </Text>
    </VStack>
  );
}

export default function BrowsePage() {
  const router = useRouter();
  const [wall, setWall] = useState(1);
  const [shelf, setShelf] = useState(1);
  const [volume, setVolume] = useState(1);
  const [page, setPage] = useState(1);

  const handleOpen = () => {
    const digs = "0123456789abcdefghijklmnopqrstuvwxyz";
    let hex = "";
    for (let i = 0; i < 100; i++) {
      hex += digs[Math.floor(Math.random() * digs.length)];
    }
    const address = `${hex}-${wall}-${shelf}-${volume}-${page}`;
    router.push(`/page/${encodeURIComponent(address)}`);
  };

  return (
    <Box maxW="800px" mx="auto" px={4} py={16} textAlign="center">
      <VStack gap={10}>
        <VStack gap={3}>
          <Heading
            as="h1"
            size="2xl"
            color="brand.400"
            fontFamily="'Playfair Display', Georgia, serif"
          >
            Обзор библиотеки
          </Heading>
          <Text color="dark.200" maxW="500px">
            Выберите расположение в библиотеке — стену, полку, том и страницу —
            и откройте случайную книгу.
          </Text>
        </VStack>

        <Flex gap={{ base: 6, md: 10 }} wrap="wrap" justify="center">
          <NumberSelector label="Стена" value={wall} onChange={setWall} min={1} max={5} />
          <NumberSelector label="Полка" value={shelf} onChange={setShelf} min={1} max={7} />
          <NumberSelector label="Том" value={volume} onChange={setVolume} min={1} max={31} />
          <NumberSelector label="Страница" value={page} onChange={setPage} min={1} max={421} />
        </Flex>

        <Button
          onClick={handleOpen}
          bg="brand.400"
          color="dark.900"
          size="lg"
          fontWeight="700"
          _hover={{ bg: "brand.300" }}
          px={10}
        >
          Открыть
        </Button>
      </VStack>
    </Box>
  );
}
