"use client";

import { Box } from "@chakra-ui/react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

const shimmerAnimation = {
  initial: { opacity: 0.3 },
  animate: {
    opacity: [0.3, 0.6, 0.3],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const },
  },
};

export function SkeletonLine({
  width = "100%",
  height = "12px",
  mt,
  mb,
}: {
  width?: string;
  height?: string;
  mt?: number;
  mb?: number;
}) {
  return (
    <motion.div {...shimmerAnimation}>
      <Box
        w={width}
        h={height}
        bg="brand.300/8"
        borderRadius="4px"
        mt={mt}
        mb={mb}
      />
    </motion.div>
  );
}

export function SkeletonBox({
  width = "100%",
  height = "200px",
  borderRadius = "8px",
  mt,
  mb,
  children,
}: {
  width?: string;
  height?: string | Record<string, string>;
  borderRadius?: string;
  mt?: number;
  mb?: number;
  children?: ReactNode;
}) {
  return (
    <motion.div {...shimmerAnimation}>
      <Box
        w={width}
        h={height}
        bg="brand.300/5"
        border="1px solid"
        borderColor="brand.300/8"
        borderRadius={borderRadius}
        mt={mt}
        mb={mb}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        {children}
      </Box>
    </motion.div>
  );
}

export function SkeletonOrnament() {
  return (
    <motion.div {...shimmerAnimation}>
      <Box display="flex" alignItems="center" justifyContent="center" gap={3} py={2}>
        <Box w="40px" h="1px" bg="brand.300/15" />
        <Box w="6px" h="6px" bg="brand.300/15" transform="rotate(45deg)" />
        <Box w="40px" h="1px" bg="brand.300/15" />
      </Box>
    </motion.div>
  );
}

export function SkeletonPage({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}
