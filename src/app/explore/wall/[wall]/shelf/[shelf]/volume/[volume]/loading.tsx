"use client";

import { Box, VStack } from "@chakra-ui/react";
import {
  SkeletonLine,
  SkeletonOrnament,
  SkeletonPage,
} from "@/components/LoadingSkeleton";
import SceneLoadingFallback from "@/components/SceneLoadingFallback";

export default function VolumeLoading() {
  return (
    <SkeletonPage>
      <Box maxW="1000px" mx="auto" px={4} py={8}>
        <VStack gap={8} align="stretch">
          <SkeletonLine width="80px" height="14px" />
          <VStack gap={2}>
            <SkeletonLine width="100px" height="10px" />
            <SkeletonLine width="260px" height="28px" />
            <SkeletonOrnament />
          </VStack>
          <SceneLoadingFallback height={{ base: "65vh", md: "75vh" }} />
          <VStack gap={2}>
            <SkeletonLine width="200px" height="12px" />
          </VStack>
        </VStack>
      </Box>
    </SkeletonPage>
  );
}
