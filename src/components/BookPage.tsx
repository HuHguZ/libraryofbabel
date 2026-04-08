"use client";

import { Box, Highlight } from "@chakra-ui/react";

interface BookPageProps {
  content: string;
  highlight?: string;
}

export default function BookPage({ content, highlight }: BookPageProps) {
  return (
    <Box position="relative" maxW="900px" mx="auto">
      {/* Outer glow */}
      <Box
        position="absolute"
        inset="-1px"
        borderRadius="6px"
        bg="transparent"
        boxShadow="0 0 40px rgba(201, 168, 76, 0.06), 0 8px 32px rgba(0, 0, 0, 0.4)"
        pointerEvents="none"
      />

      <Box
        bg="linear-gradient(170deg, #f5ebd4 0%, #ede0c0 30%, #e8d8b4 70%, #e0ceaa 100%)"
        border="1px solid"
        borderColor="brand.200/40"
        borderRadius="6px"
        boxShadow="inset 0 0 80px rgba(139, 109, 56, 0.06), inset 2px 2px 4px rgba(255, 255, 255, 0.1)"
        p={{ base: 5, md: 8 }}
        position="relative"
        overflow="hidden"
        _before={{
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(139, 109, 56, 0.04) 28px, rgba(139, 109, 56, 0.04) 29px)",
          pointerEvents: "none",
        }}
        _after={{
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          width: "40px",
          height: "100%",
          background: "linear-gradient(90deg, rgba(139, 109, 56, 0.04), transparent)",
          pointerEvents: "none",
        }}
      >
        {/* Corner decorations */}
        <Box
          position="absolute"
          top="12px"
          left="12px"
          w="16px"
          h="16px"
          borderTop="1px solid"
          borderLeft="1px solid"
          borderColor="brand.600/25"
          pointerEvents="none"
        />
        <Box
          position="absolute"
          top="12px"
          right="12px"
          w="16px"
          h="16px"
          borderTop="1px solid"
          borderRight="1px solid"
          borderColor="brand.600/25"
          pointerEvents="none"
        />
        <Box
          position="absolute"
          bottom="12px"
          left="12px"
          w="16px"
          h="16px"
          borderBottom="1px solid"
          borderLeft="1px solid"
          borderColor="brand.600/25"
          pointerEvents="none"
        />
        <Box
          position="absolute"
          bottom="12px"
          right="12px"
          w="16px"
          h="16px"
          borderBottom="1px solid"
          borderRight="1px solid"
          borderColor="brand.600/25"
          pointerEvents="none"
        />

        <Box
          fontFamily="var(--font-jetbrains), 'Courier New', monospace"
          fontSize={{ base: "11px", md: "13px" }}
          lineHeight="29px"
          color="#3a2e1a"
          whiteSpace="pre-wrap"
          wordBreak="break-all"
          position="relative"
          zIndex={1}
          letterSpacing="0.01em"
          fontWeight="400"
        >
          {highlight ? (
            <Highlight
              query={highlight}
              styles={{
                bg: "rgba(201, 168, 76, 0.35)",
                color: "#2a1f0e",
                px: "2px",
                borderRadius: "2px",
                boxShadow: "0 0 4px rgba(201, 168, 76, 0.2)",
              }}
            >
              {content}
            </Highlight>
          ) : (
            content
          )}
        </Box>
      </Box>
    </Box>
  );
}
