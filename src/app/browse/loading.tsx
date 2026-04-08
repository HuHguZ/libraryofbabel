"use client";

import { Box, VStack, Flex } from "@chakra-ui/react";
import {
  SkeletonLine,
  SkeletonBox,
  SkeletonOrnament,
  SkeletonPage,
} from "@/components/LoadingSkeleton";

export default function BrowseLoading() {
  return (
    <SkeletonPage>
      <Box
        maxW="800px"
        mx="auto"
        px={4}
        py={16}
        textAlign="center"
        minH="80vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <VStack gap={12} w="100%">
          {/* Title */}
          <VStack gap={4} w="100%">
            <SkeletonLine width="240px" height="32px" />
            <SkeletonOrnament />
            <VStack gap={2} maxW="460px" w="100%">
              <SkeletonLine width="100%" height="14px" />
              <SkeletonLine width="80%" height="14px" />
            </VStack>
          </VStack>

          {/* Number selectors */}
          <SkeletonBox width="100%" height="140px" borderRadius="8px" />

          {/* Button */}
          <SkeletonLine width="140px" height="44px" />
        </VStack>
      </Box>
    </SkeletonPage>
  );
}
