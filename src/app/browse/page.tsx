"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, VStack, Heading, Text, Button, Flex } from "@chakra-ui/react";
import { motion } from "framer-motion";
import AnimatedOrnament from "@/components/AnimatedOrnament";
import PageTransition from "@/components/PageTransition";
import { fadeInUp, stagger, scaleFade } from "@/lib/animations";



const MotionVStack = motion.create(VStack);
const MotionBox = motion.create(Box);

function NumberSelector({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <VStack gap={2}>
      <Text
        color="dark.300"
        fontSize="10px"
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing="0.15em"
        fontFamily="var(--font-jetbrains), monospace"
      >
        {label}
      </Text>
      <Flex align="center" gap={3}>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button
            size="sm"
            onClick={() => onChange(Math.max(min, value - 1))}
            bg="transparent"
            color="dark.200"
            border="1px solid"
            borderColor="dark.400/50"
            borderRadius="4px"
            _hover={{ borderColor: "brand.300/30", color: "brand.300" }}
            disabled={value <= min}
            transition="all 0.2s ease"
            minW="32px"
            h="32px"
          >
            −
          </Button>
        </motion.div>
        <motion.div
          key={value}
          initial={{ scale: 1.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 15, stiffness: 300 }}
        >
          <Text
            color="brand.300"
            fontSize="2xl"
            fontWeight="500"
            fontFamily="var(--font-cormorant), Georgia, serif"
            minW="50px"
            textAlign="center"
          >
            {value}
          </Text>
        </motion.div>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button
            size="sm"
            onClick={() => onChange(Math.min(max, value + 1))}
            bg="transparent"
            color="dark.200"
            border="1px solid"
            borderColor="dark.400/50"
            borderRadius="4px"
            _hover={{ borderColor: "brand.300/30", color: "brand.300" }}
            disabled={value >= max}
            transition="all 0.2s ease"
            minW="32px"
            h="32px"
          >
            +
          </Button>
        </motion.div>
      </Flex>
      <Text
        color="dark.400"
        fontSize="10px"
        fontFamily="var(--font-jetbrains), monospace"
        fontWeight="300"
      >
        {min}–{max}
      </Text>
    </VStack>
  );
}

export default function BrowsePage() {
  const router = useRouter();
  const [wall, setWall] = useState(1);
  const [shelf, setShelf] = useState(1);
  const [volume, setVolume] = useState(1);
  const [page, setPage] = useState(1);

  const handleOpen = () => {
    const digs = "0123456789abcdefghijklmnopqrstuvwxyz";
    let hex = "";
    for (let i = 0; i < 100; i++) {
      hex += digs[Math.floor(Math.random() * digs.length)];
    }
    const address = `${hex}-${wall}-${shelf}-${volume}-${page}`;
    router.push(`/page/${encodeURIComponent(address)}`);
  };

  return (
    <PageTransition>
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
        <MotionVStack
          gap={12}
          variants={stagger(0.15)}
          initial="hidden"
          animate="visible"
        >
          <MotionVStack gap={4} variants={fadeInUp}>
            <Heading
              as="h1"
              fontSize={{ base: "2xl", md: "4xl" }}
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="500"
              letterSpacing="0.04em"
            >
              Обзор библиотеки
            </Heading>
            <AnimatedOrnament />
            <Text
              color="dark.200"
              maxW="460px"
              fontSize="md"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontStyle="italic"
              lineHeight="1.7"
            >
              Выберите расположение в библиотеке — стену, полку, том и страницу —
              и откройте случайную книгу.
            </Text>
          </MotionVStack>

          <MotionBox
            variants={scaleFade}
            bg="dark.700/30"
            border="1px solid"
            borderColor="brand.300/8"
            borderRadius="8px"
            p={{ base: 6, md: 8 }}
          >
            <Flex gap={{ base: 6, md: 10 }} wrap="wrap" justify="center">
              <NumberSelector label="Стена" value={wall} onChange={setWall} min={1} max={5} />
              <NumberSelector label="Полка" value={shelf} onChange={setShelf} min={1} max={7} />
              <NumberSelector label="Том" value={volume} onChange={setVolume} min={1} max={31} />
              <NumberSelector label="Страница" value={page} onChange={setPage} min={1} max={421} />
            </Flex>
          </MotionBox>

          <motion.div variants={fadeInUp}>
            <motion.div
              whileHover={{
                scale: 1.03,
                boxShadow: "0 0 30px rgba(201, 168, 76, 0.12)",
              }}
              whileTap={{ scale: 0.97 }}
              style={{ display: "inline-block" }}
            >
              <Button
                onClick={handleOpen}
                bg="brand.300/10"
                color="brand.300"
                border="1px solid"
                borderColor="brand.300/25"
                size="lg"
                fontWeight="500"
                fontFamily="var(--font-cormorant), Georgia, serif"
                fontSize="lg"
                letterSpacing="0.08em"
                _hover={{
                  bg: "brand.300/18",
                  borderColor: "brand.300/40",
                }}
                px={12}
                borderRadius="6px"
                transition="background 0.3s ease, border-color 0.3s ease"
              >
                Открыть
              </Button>
            </motion.div>
          </motion.div>
        </MotionVStack>
      </Box>
    </PageTransition>
  );
}
