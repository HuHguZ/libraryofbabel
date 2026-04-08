"use client";

import { Box, Highlight } from "@chakra-ui/react";

interface BookPageProps {
  content: string;
  highlight?: string;
}

export default function BookPage({ content, highlight }: BookPageProps) {
  return (
    <Box
      bg="parchment.200"
      border="2px solid"
      borderColor="brand.400"
      borderRadius="4px"
      boxShadow="0 4px 24px rgba(197, 165, 90, 0.15), inset 0 0 60px rgba(139, 109, 56, 0.08)"
      p={{ base: 4, md: 8 }}
      maxW="900px"
      mx="auto"
      position="relative"
      _before={{
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background:
          "repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(139, 109, 56, 0.06) 28px, rgba(139, 109, 56, 0.06) 29px)",
        pointerEvents: "none",
        borderRadius: "4px",
      }}
    >
      <Box
        fontFamily="'Courier New', Courier, monospace"
        fontSize={{ base: "12px", md: "14px" }}
        lineHeight="29px"
        color="parchment.900"
        whiteSpace="pre-wrap"
        wordBreak="break-all"
        position="relative"
        zIndex={1}
        letterSpacing="0.02em"
      >
        {highlight ? (
          <Highlight
            query={highlight}
            styles={{ bg: "brand.400", color: "dark.900", px: "1", borderRadius: "2px" }}
          >
            {content}
          </Highlight>
        ) : (
          content
        )}
      </Box>
    </Box>
  );
}
