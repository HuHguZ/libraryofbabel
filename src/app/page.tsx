"use client";

import { Box, Heading, Text, VStack } from "@chakra-ui/react";
import { motion } from "framer-motion";
import SearchBar from "@/components/SearchBar";
import AnimatedOrnament from "@/components/AnimatedOrnament";
import PageTransition from "@/components/PageTransition";
import { fadeInUp, stagger, counterPop } from "@/lib/animations";

const MotionBox = motion.create(Box);
const MotionVStack = motion.create(VStack);
const MotionText = motion.create(Text);

export default function Home() {
  return (
    <PageTransition>
      <Box
        minH="85vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        px={4}
        py={16}
      >
        <MotionVStack
          gap={12}
          maxW="800px"
          textAlign="center"
          variants={stagger(0.15)}
          initial="hidden"
          animate="visible"
        >
          {/* Hero */}
          <MotionVStack gap={5} variants={fadeInUp}>
            <Text
              color="dark.300"
              fontSize="11px"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.35em"
              fontFamily="var(--font-jetbrains), monospace"
            >
              Хорхе Луис Борхес
            </Text>

            <Heading
              as="h1"
              fontSize={{ base: "3xl", md: "5xl", lg: "6xl" }}
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="500"
              lineHeight="1.1"
              letterSpacing="0.04em"
            >
              Вавилонская
              <br />
              Библиотека
            </Heading>

            <AnimatedOrnament />
          </MotionVStack>

          {/* Quote */}
          <MotionText
            color="dark.200"
            fontSize={{ base: "md", md: "lg" }}
            lineHeight="1.9"
            maxW="560px"
            fontFamily="var(--font-cormorant), Georgia, serif"
            fontStyle="italic"
            fontWeight="400"
            variants={fadeInUp}
          >
            Вселенная — некоторые называют её Библиотекой — состоит из
            огромного, возможно бесконечного числа шестигранных галерей.
            Библиотека содержит все возможные книги.
          </MotionText>

          {/* Search */}
          <MotionBox w="100%" variants={fadeInUp}>
            <SearchBar />
          </MotionBox>

          {/* Stats */}
          <MotionBox
            display="flex"
            gap={{ base: 3, md: 0 }}
            flexWrap="wrap"
            justifyContent="center"
            variants={fadeInUp}
          >
            {[
              { value: "5", label: "стен" },
              { value: "7", label: "полок" },
              { value: "31", label: "том" },
              { value: "421", label: "страниц" },
              { value: "4 819", label: "символов" },
            ].map((stat, i) => (
              <Box
                key={stat.label}
                display="flex"
                alignItems="center"
                gap={0}
              >
                <VStack gap={0} px={{ base: 3, md: 5 }}>
                  <motion.div variants={counterPop}>
                    <Text
                      color="brand.300"
                      fontSize={{ base: "lg", md: "xl" }}
                      fontWeight="500"
                      fontFamily="var(--font-cormorant), Georgia, serif"
                    >
                      {stat.value}
                    </Text>
                  </motion.div>
                  <Text
                    color="dark.300"
                    fontSize="9px"
                    textTransform="uppercase"
                    letterSpacing="0.12em"
                    fontFamily="var(--font-jetbrains), monospace"
                    fontWeight="400"
                  >
                    {stat.label}
                  </Text>
                </VStack>
                {i < 4 && (
                  <Box
                    w="1px"
                    h="20px"
                    bg="brand.300/10"
                    display={{ base: "none", md: "block" }}
                  />
                )}
              </Box>
            ))}
          </MotionBox>
        </MotionVStack>
      </Box>
    </PageTransition>
  );
}
