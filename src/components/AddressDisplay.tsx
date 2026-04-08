"use client";

import { useState } from "react";
import { Box, Flex, Text, Button } from "@chakra-ui/react";

interface AddressDisplayProps {
  address: string;
}

export default function AddressDisplay({ address }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      bg="dark.500"
      border="1px solid"
      borderColor="brand.400/27"
      borderRadius="6px"
      p={4}
      maxW="700px"
      mx="auto"
    >
      <Text color="dark.300" fontSize="xs" mb={2} fontWeight="600" textTransform="uppercase" letterSpacing="0.1em">
        Адрес
      </Text>
      <Flex align="center" gap={3}>
        <Text
          color="brand.300"
          fontFamily="'Courier New', monospace"
          fontSize={{ base: "xs", md: "sm" }}
          wordBreak="break-all"
          flex={1}
        >
          {address}
        </Text>
        <Button
          onClick={handleCopy}
          size="sm"
          bg="transparent"
          color="brand.400"
          border="1px solid"
          borderColor="brand.400/27"
          _hover={{ bg: "brand.400/13" }}
          flexShrink={0}
        >
          {copied ? "Скопировано!" : "Копировать"}
        </Button>
      </Flex>
    </Box>
  );
}
