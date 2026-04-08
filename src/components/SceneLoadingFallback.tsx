"use client";

import { Box, VStack, Text } from "@chakra-ui/react";
import { motion } from "framer-motion";

export default function SceneLoadingFallback({
  height,
}: {
  height?: string | Record<string, string>;
}) {
  return (
    <Box
      w="100%"
      h={height ?? { base: "50vh", md: "60vh" }}
      borderRadius="8px"
      overflow="hidden"
      border="1px solid"
      borderColor="brand.300/10"
      bg="dark.900"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <VStack gap={4}>
        {/* Animated book icon */}
        <motion.div
          animate={{
            rotateY: [0, 180, 360],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ perspective: 200 }}
        >
          <Box
            w="40px"
            h="52px"
            border="1.5px solid"
            borderColor="brand.300/40"
            borderRadius="2px 6px 6px 2px"
            position="relative"
            _before={{
              content: '""',
              position: "absolute",
              left: "0",
              top: "4px",
              bottom: "4px",
              width: "1.5px",
              bg: "brand.300/30",
            }}
          />
        </motion.div>
        <motion.div
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Text
            color="dark.300"
            fontSize="xs"
            fontFamily="var(--font-cormorant), Georgia, serif"
            fontStyle="italic"
          >
            Загрузка сцены...
          </Text>
        </motion.div>
      </VStack>
    </Box>
  );
}
