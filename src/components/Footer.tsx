"use client";

import { Box, Text } from "@chakra-ui/react";

export default function Footer() {
  return (
    <Box
      as="footer"
      bg="dark.900"
      borderTop="1px solid"
      borderColor="brand.400/20"
      px={6}
      py={4}
      textAlign="center"
    >
      <Text color="dark.300" fontSize="sm">
        По мотивам рассказа Хорхе Луиса Борхеса «Вавилонская библиотека» (1941)
      </Text>
    </Box>
  );
}
