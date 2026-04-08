"use client";

import { Box, Text } from "@chakra-ui/react";
import { motion } from "framer-motion";
import AnimatedOrnament from "@/components/AnimatedOrnament";
import { fadeIn } from "@/lib/animations";

const MotionBox = motion.create(Box);

export default function Footer() {
  return (
    <MotionBox
      as="footer"
      px={6}
      py={6}
      textAlign="center"
      variants={fadeIn}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      <Box mb={4}>
        <AnimatedOrnament />
      </Box>
      <Text
        color="dark.300"
        fontSize="xs"
        fontFamily="var(--font-cormorant), Georgia, serif"
        fontStyle="italic"
        fontWeight="400"
        letterSpacing="0.05em"
      >
        По мотивам рассказа Хорхе Луиса Борхеса «Вавилонская библиотека» (1941)
      </Text>
    </MotionBox>
  );
}
