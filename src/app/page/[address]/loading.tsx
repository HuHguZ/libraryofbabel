"use client";

import { Box, VStack } from "@chakra-ui/react";
import {
  SkeletonLine,
  SkeletonBox,
  SkeletonOrnament,
  SkeletonPage,
} from "@/components/LoadingSkeleton";

export default function PageViewLoading() {
  return (
    <SkeletonPage>
      <Box maxW="1000px" mx="auto" px={4} py={8}>
        <VStack gap={8} align="stretch">
          {/* Back link */}
          <SkeletonLine width="80px" height="14px" />

          {/* Title area */}
          <VStack gap={2}>
            <SkeletonLine width="70px" height="10px" />
            <SkeletonLine width="200px" height="24px" />
            <SkeletonOrnament />
          </VStack>

          {/* Library nav */}
          <Box display="flex" gap={4} justifyContent="center">
            {Array.from({ length: 4 }, (_, i) => (
              <VStack key={i} gap={1}>
                <SkeletonLine width="50px" height="10px" />
                <SkeletonLine width="30px" height="24px" />
              </VStack>
            ))}
          </Box>

          {/* Book page content */}
          <SkeletonBox width="100%" height="400px" borderRadius="6px" />

          {/* Page navigation */}
          <Box display="flex" justifyContent="center" gap={4}>
            <SkeletonLine width="100px" height="36px" />
            <SkeletonLine width="100px" height="36px" />
          </Box>

          {/* Address */}
          <SkeletonBox width="100%" height="60px" borderRadius="6px" />
        </VStack>
      </Box>
    </SkeletonPage>
  );
}
