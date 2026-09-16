import { Box } from "@chakra-ui/react";

/** Dark stage placeholder while the immersive page and its scene load. */
export default function Loading() {
  return <Box w="100%" h="calc(100dvh - var(--header-h))" minH="440px" bg="#07060a" />;
}
