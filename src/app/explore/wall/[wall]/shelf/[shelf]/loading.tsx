"use client";

import { Box, VStack } from "@chakra-ui/react";
import {
  SkeletonLine,
  SkeletonBox,
  SkeletonOrnament,
  SkeletonPage,
} from "@/components/LoadingSkeleton";
import SceneLoadingFallback from "@/components/SceneLoadingFallback";

export default function ShelfLoading() {
  return (
    <SkeletonPage>
      <Box maxW="1000px" mx="auto" px={4} py={8}>
        <VStack gap={8} align="stretch">
          <SkeletonLine width="90px" height="14px" />
          <VStack gap={2}>
            <SkeletonLine width="110px" height="10px" />
            <SkeletonLine width="200px" height="28px" />
            <SkeletonOrnament />
          </VStack>
          <SceneLoadingFallback />
          <Box display="flex" gap={2} justifyContent="center">
            {Array.from({ length: 7 }, (_, i) => (
              <SkeletonBox key={i} width="40px" height="36px" borderRadius="6px" />
            ))}
          </Box>
        </VStack>
      </Box>
    </SkeletonPage>
  );
}
