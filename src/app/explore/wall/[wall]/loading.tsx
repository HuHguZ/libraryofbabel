"use client";

import { Box, VStack } from "@chakra-ui/react";
import {
  SkeletonLine,
  SkeletonBox,
  SkeletonOrnament,
  SkeletonPage,
} from "@/components/LoadingSkeleton";
import SceneLoadingFallback from "@/components/SceneLoadingFallback";

export default function WallLoading() {
  return (
    <SkeletonPage>
      <Box maxW="1000px" mx="auto" px={4} py={8}>
        <VStack gap={8} align="stretch">
          <SkeletonLine width="100px" height="14px" />
          <VStack gap={2}>
            <SkeletonLine width="140px" height="10px" />
            <SkeletonLine width="120px" height="28px" />
            <SkeletonOrnament />
          </VStack>
          <SceneLoadingFallback />
          <Box display="flex" gap={2} justifyContent="center">
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonBox key={i} width="80px" height="36px" borderRadius="6px" />
            ))}
          </Box>
        </VStack>
      </Box>
    </SkeletonPage>
  );
}
