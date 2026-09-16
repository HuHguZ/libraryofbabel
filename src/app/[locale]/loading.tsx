"use client";

import { Box, VStack } from "@chakra-ui/react";
import {
  SkeletonLine,
  SkeletonBox,
  SkeletonOrnament,
  SkeletonPage,
} from "@/components/LoadingSkeleton";

export default function HomeLoading() {
  return (
    <SkeletonPage>
      <Box
        minH="85vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        px={4}
        py={16}
      >
        <VStack gap={12} maxW="800px" w="100%" textAlign="center">
          {/* Author label */}
          <VStack gap={5} w="100%">
            <SkeletonLine width="140px" height="10px" />
            {/* Title */}
            <VStack gap={2} w="100%">
              <SkeletonLine width="280px" height="36px" />
              <SkeletonLine width="220px" height="36px" />
            </VStack>
            <SkeletonOrnament />
          </VStack>

          {/* Quote */}
          <VStack gap={2} w="100%" maxW="560px">
            <SkeletonLine width="100%" height="14px" />
            <SkeletonLine width="90%" height="14px" />
            <SkeletonLine width="70%" height="14px" />
          </VStack>

          {/* Search bar */}
          <Box maxW="640px" w="100%">
            <SkeletonBox width="100%" height="52px" borderRadius="8px" />
          </Box>

          {/* Stats */}
          <Box display="flex" gap={5} justifyContent="center">
            {Array.from({ length: 5 }, (_, i) => (
              <VStack key={i} gap={1}>
                <SkeletonLine width="30px" height="20px" />
                <SkeletonLine width="50px" height="8px" />
              </VStack>
            ))}
          </Box>
        </VStack>
      </Box>
    </SkeletonPage>
  );
}
