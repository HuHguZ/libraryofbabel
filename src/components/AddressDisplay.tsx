"use client";

import { useState } from "react";
import { Box, Flex, Text, Button } from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";

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
      bg="dark.700/50"
      border="1px solid"
      borderColor="brand.300/10"
      borderRadius="6px"
      p={4}
      maxW="700px"
      mx="auto"
    >
      <Text
        color="dark.300"
        fontSize="10px"
        mb={2}
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing="0.15em"
        fontFamily="var(--font-jetbrains), monospace"
      >
        Адрес в библиотеке
      </Text>
      <Flex align="center" gap={3}>
        <Text
          color="brand.300/70"
          fontFamily="var(--font-jetbrains), monospace"
          fontSize={{ base: "10px", md: "11px" }}
          wordBreak="break-all"
          flex={1}
          lineHeight="1.6"
          fontWeight="300"
        >
          {address}
        </Text>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            onClick={handleCopy}
            size="xs"
            bg="transparent"
            color={copied ? "brand.300" : "dark.200"}
            border="1px solid"
            borderColor={copied ? "brand.300/30" : "dark.400/40"}
            borderRadius="4px"
            _hover={{ bg: "brand.300/8", borderColor: "brand.300/25" }}
            flexShrink={0}
            fontSize="xs"
            fontWeight="400"
            transition="all 0.2s ease"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={copied ? "copied" : "copy"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {copied ? "Скопировано" : "Копировать"}
              </motion.span>
            </AnimatePresence>
          </Button>
        </motion.div>
      </Flex>
    </Box>
  );
}
