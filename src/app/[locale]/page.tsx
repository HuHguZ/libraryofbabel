"use client";

import { useState, useEffect, useRef } from "react";
import { Box, Heading, Text, VStack, Flex } from "@chakra-ui/react";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useMotionValue,
  useSpring,
  AnimatePresence,
} from "motion/react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import SearchBar from "@/components/SearchBar";
import AnimatedOrnament from "@/components/AnimatedOrnament";
import PageTransition from "@/components/PageTransition";
import { Link, useRouter } from "@/i18n/navigation";
import { ALPHABET_PARTS, ALPHABETS } from "@/lib/alphabet";
import { LIBRARY } from "@/lib/library";
import {
  fadeInUp,
  stagger,
  counterPop,
  scrollFadeInUp,
  drawPath,
} from "@/lib/animations";

const MotionBox = motion.create(Box);
const MotionVStack = motion.create(VStack);
const MotionText = motion.create(Text);

/* ─── Scroll progress of a section (0 → 1 while it crosses the viewport) ─── */
function useSectionProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  return { ref, progress: scrollYProgress };
}

/* ─── Animated counter ─── */
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const locale = useLocale();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { damping: 40, stiffness: 80 });

  useEffect(() => {
    if (inView) motionVal.set(target);
  }, [inView, target, motionVal]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => {
      if (ref.current) {
        ref.current.textContent = Math.floor(v).toLocaleString(locale) + suffix;
      }
    });
    return unsub;
  }, [spring, suffix, locale]);

  return <span ref={ref}>0{suffix}</span>;
}

/* ─── Hexagon SVG decorative grid ─── */
function HexGrid() {
  const cols = 7;
  const rows = 5;
  const size = 32;
  const w = size * Math.sqrt(3);
  const h = size * 2;

  return (
    <svg
      viewBox={`0 0 ${w * cols + w / 2} ${h * rows * 0.75 + h / 4}`}
      style={{ width: "100%", maxWidth: 420, height: "auto", opacity: 0.15 }}
    >
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
          const x = col * w + (row % 2 === 1 ? w / 2 : 0) + w / 2;
          const y = row * h * 0.75 + h / 2;
          return (
            <motion.polygon
              key={`${row}-${col}`}
              points={hexPoints(x, y, size)}
              fill="none"
              stroke="rgba(201, 168, 76, 0.6)"
              strokeWidth="0.5"
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{
                delay: (row * cols + col) * 0.03,
                duration: 0.5,
                ease: "easeOut",
              }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            />
          );
        })
      )}
    </svg>
  );
}

function hexPoints(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

/* ─── Rotating quotes (texts live in the messages under Home.quotes) ─── */
const quotes = ["universe", "shelves", "eternity", "everything"] as const;

/* ─── Navigation card ─── */
function NavCard({
  title,
  description,
  href,
  icon,
  delay,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, transition: { duration: 0.3 } }}
      style={{ flex: "1 1 280px", maxWidth: 360 }}
    >
      <Link href={href} style={{ textDecoration: "none" }}>
        <Box
          bg="rgba(17, 17, 25, 0.6)"
          border="1px solid"
          borderColor="rgba(201, 168, 76, 0.1)"
          borderRadius="12px"
          p={{ base: 6, md: 8 }}
          h="100%"
          cursor="pointer"
          transition="all 0.4s ease"
          _hover={{
            borderColor: "rgba(201, 168, 76, 0.3)",
            bg: "rgba(17, 17, 25, 0.8)",
            boxShadow: "0 8px 40px rgba(201, 168, 76, 0.06), 0 0 1px rgba(201, 168, 76, 0.3)",
          }}
          position="relative"
          overflow="hidden"
        >
          <Box
            position="absolute"
            top="-50%"
            right="-50%"
            w="100%"
            h="100%"
            bg="radial-gradient(circle, rgba(201, 168, 76, 0.03) 0%, transparent 70%)"
            pointerEvents="none"
          />
          <VStack gap={4} align="flex-start" position="relative">
            <Box color="rgba(201, 168, 76, 0.7)" fontSize="2xl">
              {icon}
            </Box>
            <Heading
              as="h3"
              fontSize="xl"
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="500"
              letterSpacing="0.03em"
            >
              {title}
            </Heading>
            <Text
              color="dark.200"
              fontSize="sm"
              lineHeight="1.7"
              fontFamily="var(--font-cormorant), Georgia, serif"
            >
              {description}
            </Text>
          </VStack>
        </Box>
      </Link>
    </motion.div>
  );
}

/* ─── SVG Icons ─── */
const SearchIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
);

const BookIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <line x1="9" y1="7" x2="16" y2="7" />
    <line x1="9" y1="11" x2="14" y2="11" />
  </svg>
);

const CubeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

/* ─── Decorative SVG ornament between sections ─── */
function SectionOrnament() {
  return (
    <motion.div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "48px 0",
      }}
    >
      <motion.svg
        width="200"
        height="20"
        viewBox="0 0 200 20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <motion.line
          x1="0"
          y1="10"
          x2="85"
          y2="10"
          stroke="rgba(201, 168, 76, 0.3)"
          strokeWidth="0.5"
          variants={drawPath}
        />
        <motion.polygon
          points="100,3 107,10 100,17 93,10"
          fill="none"
          stroke="rgba(201, 168, 76, 0.5)"
          strokeWidth="0.5"
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8, duration: 0.5 }}
          style={{ transformOrigin: "100px 10px" }}
        />
        <motion.line
          x1="115"
          y1="10"
          x2="200"
          y2="10"
          stroke="rgba(201, 168, 76, 0.3)"
          strokeWidth="0.5"
          variants={drawPath}
        />
      </motion.svg>
    </motion.div>
  );
}

/* ─── Scroll indicator arrow ─── */
function ScrollIndicator() {
  return (
    <motion.div
      style={{
        position: "absolute",
        bottom: 32,
        left: "50%",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 2, duration: 1 }}
    >
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        style={{ transform: "translateX(-50%)" }}
      >
        <svg
          width="20"
          height="28"
          viewBox="0 0 20 28"
          fill="none"
          stroke="rgba(201, 168, 76, 0.3)"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <rect x="1" y="1" width="18" height="26" rx="9" />
          <motion.line
            x1="10"
            y1="7"
            x2="10"
            y2="13"
            animate={{ y: [0, 3, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>
      </motion.div>
    </motion.div>
  );
}

function SearchSection() {
  const t = useTranslations("Home.search");
  const { ref, progress } = useSectionProgress();
          const titleY = useTransform(progress, [0, 1], [40, -40]);
          const searchY = useTransform(progress, [0, 1], [60, -20]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
            <Box py={{ base: 16, md: 24 }} px={4}>
              <MotionVStack
                gap={8}
                maxW="700px"
                mx="auto"
                textAlign="center"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={stagger(0.12)}
              >
                <motion.div variants={scrollFadeInUp} style={{ y: titleY }}>
                  <Text
                    color="dark.300"
                    fontSize="10px"
                    fontWeight="500"
                    textTransform="uppercase"
                    letterSpacing="0.3em"
                    fontFamily="var(--font-jetbrains), monospace"
                    mb={3}
                  >
                    {t("kicker")}
                  </Text>
                  <Heading
                    as="h2"
                    fontSize={{ base: "2xl", md: "4xl" }}
                    color="brand.300"
                    fontFamily="var(--font-cormorant), Georgia, serif"
                    fontWeight="400"
                    letterSpacing="0.04em"
                  >
                    {t("title")}
                  </Heading>
                </motion.div>

                <motion.div style={{ y: titleY }}>
                  <MotionText
                    color="dark.200"
                    fontSize={{ base: "md", md: "lg" }}
                    lineHeight="1.8"
                    maxW="500px"
                    fontFamily="var(--font-cormorant), Georgia, serif"
                    fontStyle="italic"
                    variants={scrollFadeInUp}
                  >
                    {t("text")}
                  </MotionText>
                </motion.div>

                <motion.div variants={scrollFadeInUp} style={{ width: "100%", y: searchY }}>
                  <SearchBar />
                </motion.div>
              </MotionVStack>
            </Box>
    </div>
  );
}

function QuotesSection({ quoteIndex, setQuoteIndex }: { quoteIndex: number; setQuoteIndex: (i: number) => void }) {
  const t = useTranslations("Home.quotes");
  const common = useTranslations("Common");
  const { ref, progress } = useSectionProgress();
          const quoteY = useTransform(progress, [0, 1], [30, -30]);
          const quotemarkY = useTransform(progress, [0, 1], [50, -50]);
          const quoteScale = useTransform(progress, [0, 0.5, 1], [0.97, 1, 0.97]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Box py={{ base: 12, md: 20 }} px={4}>
        <VStack gap={6} maxW="650px" mx="auto" textAlign="center" minH="180px" justify="center">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            style={{ y: quotemarkY }}
          >
            <svg
              width="32"
              height="24"
              viewBox="0 0 32 24"
              fill="none"
            >
              <path
                d="M0 24V14.4C0 10.4 0.8 7.2 2.4 4.8C4.13 2.4 6.67 0.8 10 0L11.6 3.2C9.73 3.73 8.27 4.67 7.2 6C6.13 7.2 5.53 8.67 5.4 10.4H10V24H0ZM18 24V14.4C18 10.4 18.8 7.2 20.4 4.8C22.13 2.4 24.67 0.8 28 0L29.6 3.2C27.73 3.73 26.27 4.67 25.2 6C24.13 7.2 23.53 8.67 23.4 10.4H28V24H18Z"
                fill="rgba(201, 168, 76, 0.15)"
              />
            </svg>
          </motion.div>

          <motion.div style={{ y: quoteY, scale: quoteScale }}>
          <Box position="relative" minH="120px" display="flex" alignItems="center">
            <AnimatePresence mode="wait">
              <motion.div
                key={quoteIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <Text
                  color="parchment.200"
                  fontSize={{ base: "md", md: "xl" }}
                  lineHeight="2"
                  fontFamily="var(--font-cormorant), Georgia, serif"
                  fontStyle="italic"
                  fontWeight="300"
                  letterSpacing="0.02em"
                >
                  {common("quoted", { text: t(quotes[quoteIndex]) })}
                </Text>
                <Text
                  color="dark.300"
                  fontSize="xs"
                  mt={4}
                  fontFamily="var(--font-jetbrains), monospace"
                  fontWeight="300"
                  letterSpacing="0.1em"
                >
                  — {t("source")}
                </Text>
              </motion.div>
            </AnimatePresence>
          </Box>
          </motion.div>

          {/* Dots indicator */}
          <Flex gap={2} justify="center">
            {quotes.map((_, i) => (
              <motion.div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  cursor: "pointer",
                  background:
                    i === quoteIndex
                      ? "rgba(201, 168, 76, 0.6)"
                      : "rgba(201, 168, 76, 0.15)",
                }}
                animate={{
                  scale: i === quoteIndex ? 1.3 : 1,
                  background:
                    i === quoteIndex
                      ? "rgba(201, 168, 76, 0.6)"
                      : "rgba(201, 168, 76, 0.15)",
                }}
                transition={{ duration: 0.3 }}
                onClick={() => setQuoteIndex(i)}
                whileHover={{ scale: 1.5 }}
              />
            ))}
          </Flex>
        </VStack>
      </Box>
    </div>
  );
}

function StructureSection() {
  const t = useTranslations("Home.structure");
  const locale = useLocale();
  const { ref, progress } = useSectionProgress();
          const hexY = useTransform(progress, [0, 1], [60, -60]);
          const hexRotate = useTransform(progress, [0, 1], [-5, 5]);
          const titleY4 = useTransform(progress, [0, 1], [30, -30]);
          const cardsY = useTransform(progress, [0, 1], [50, -20]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Box py={{ base: 16, md: 24 }} px={4}>
        <MotionVStack
          gap={{ base: 10, md: 16 }}
          maxW="900px"
          mx="auto"
          textAlign="center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger(0.15)}
        >
          <motion.div variants={scrollFadeInUp} style={{ y: titleY4 }}>
            <Text
              color="dark.300"
              fontSize="10px"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.3em"
              fontFamily="var(--font-jetbrains), monospace"
              mb={3}
            >
              {t("kicker")}
            </Text>
            <Heading
              as="h2"
              fontSize={{ base: "2xl", md: "4xl" }}
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="400"
              letterSpacing="0.04em"
            >
              {t("title")}
            </Heading>
          </motion.div>

          {/* Hex grid illustration — floats with parallax */}
          <motion.div
            variants={scrollFadeInUp}
            style={{ display: "flex", justifyContent: "center", y: hexY, rotate: hexRotate }}
          >
            <HexGrid />
          </motion.div>

          {/* Structure cards */}
          <motion.div style={{ y: cardsY, width: "100%" }}>
          <Flex
            gap={{ base: 4, md: 6 }}
            wrap="wrap"
            justify="center"
            w="100%"
          >
            {[
              {
                icon: "⬡",
                title: t("galleryTitle"),
                text: t("galleryText"),
              },
              {
                icon: "▐",
                title: t("wallsTitle", { walls: LIBRARY.walls, shelves: LIBRARY.shelves }),
                text: t("wallsText"),
              },
              {
                icon: "◰",
                title: t("pagesTitle", { pages: LIBRARY.pages }),
                text: t("pagesText"),
              },
              {
                icon: "∞",
                title: t("booksTitle"),
                text: t("booksText", { symbols: ALPHABETS[locale].length }),
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
                whileHover={{
                  y: -4,
                  transition: { duration: 0.25 },
                }}
                style={{
                  flex: "1 1 200px",
                  maxWidth: 220,
                }}
              >
                <Box
                  bg="rgba(17, 17, 25, 0.4)"
                  border="1px solid"
                  borderColor="rgba(201, 168, 76, 0.08)"
                  borderRadius="10px"
                  p={6}
                  h="100%"
                  transition="border-color 0.3s ease"
                  _hover={{ borderColor: "rgba(201, 168, 76, 0.2)" }}
                >
                  <VStack gap={3} align="center">
                    <Text
                      fontSize="2xl"
                      color="brand.300"
                      fontFamily="var(--font-cormorant), Georgia, serif"
                    >
                      {item.icon}
                    </Text>
                    <Text
                      color="parchment.200"
                      fontSize="sm"
                      fontWeight="500"
                      fontFamily="var(--font-cormorant), Georgia, serif"
                      letterSpacing="0.03em"
                    >
                      {item.title}
                    </Text>
                    <Text
                      color="dark.200"
                      fontSize="xs"
                      lineHeight="1.7"
                      fontFamily="var(--font-cormorant), Georgia, serif"
                    >
                      {item.text}
                    </Text>
                  </VStack>
                </Box>
              </motion.div>
            ))}
          </Flex>
          </motion.div>
        </MotionVStack>
      </Box>
    </div>
  );
}

function NumbersSection() {
  const t = useTranslations("Home.numbers");
  const locale = useLocale();
  const symbols = ALPHABETS[locale].length;
  const parts = ALPHABET_PARTS[locale];
  // symbols ^ pageLength written as mantissa × 10^exponent.
  const log = LIBRARY.pageLength * Math.log10(symbols);
  const exponent = Math.floor(log);
  const mantissa = (10 ** (log - exponent)).toLocaleString(locale, { maximumFractionDigits: 1 });
  const { ref, progress } = useSectionProgress();
          const titleY5 = useTransform(progress, [0, 1], [25, -25]);
          const numbersY = useTransform(progress, [0, 1], [40, -20]);
          const totalY = useTransform(progress, [0, 1], [50, -30]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Box py={{ base: 16, md: 24 }} px={4}>
        <MotionVStack
          gap={{ base: 10, md: 14 }}
          maxW="800px"
          mx="auto"
          textAlign="center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger(0.12)}
        >
          <motion.div variants={scrollFadeInUp} style={{ y: titleY5 }}>
            <Text
              color="dark.300"
              fontSize="10px"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.3em"
              fontFamily="var(--font-jetbrains), monospace"
              mb={3}
            >
              {t("kicker")}
            </Text>
            <Heading
              as="h2"
              fontSize={{ base: "2xl", md: "4xl" }}
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="400"
              letterSpacing="0.04em"
            >
              {t("title")}
            </Heading>
          </motion.div>

          <motion.div style={{ y: numbersY, width: "100%" }}>
          <Flex
            gap={{ base: 6, md: 10 }}
            wrap="wrap"
            justify="center"
            w="100%"
          >
            {[
              {
                value: symbols,
                suffix: "",
                label: t("alphabet", { count: symbols }),
                note: t("alphabetNote", { letters: parts.letters.length, digits: parts.digits.length, marks: parts.punctuation.length }),
              },
              { value: LIBRARY.pageLength, suffix: "", label: t("pageLength", { count: LIBRARY.pageLength }), note: t("pageLengthNote") },
              { value: LIBRARY.pages, suffix: "", label: t("pages", { count: LIBRARY.pages }), note: t("pagesNote") },
              {
                value: LIBRARY.walls * LIBRARY.shelves * LIBRARY.volumes,
                suffix: "",
                label: t("volumes", { count: LIBRARY.walls * LIBRARY.shelves * LIBRARY.volumes }),
                note: t("volumesNote", { walls: LIBRARY.walls, shelves: LIBRARY.shelves, volumes: LIBRARY.volumes }),
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.12, duration: 0.6 }}
                style={{ flex: "1 1 180px", maxWidth: 200 }}
              >
                <VStack gap={2}>
                  <Text
                    color="brand.300"
                    fontSize={{ base: "3xl", md: "4xl" }}
                    fontWeight="300"
                    fontFamily="var(--font-cormorant), Georgia, serif"
                    lineHeight="1"
                  >
                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  </Text>
                  <Text
                    color="parchment.200"
                    fontSize="sm"
                    fontWeight="400"
                    fontFamily="var(--font-cormorant), Georgia, serif"
                  >
                    {stat.label}
                  </Text>
                  <Text
                    color="dark.300"
                    fontSize="10px"
                    lineHeight="1.5"
                    fontFamily="var(--font-jetbrains), monospace"
                    fontWeight="300"
                    maxW="160px"
                  >
                    {stat.note}
                  </Text>
                </VStack>
              </motion.div>
            ))}
          </Flex>
          </motion.div>

          {/* Grand total */}
          <motion.div variants={scrollFadeInUp} style={{ y: totalY }}>
            <Box
              bg="rgba(201, 168, 76, 0.03)"
              border="1px solid"
              borderColor="rgba(201, 168, 76, 0.1)"
              borderRadius="12px"
              px={{ base: 6, md: 10 }}
              py={{ base: 6, md: 8 }}
            >
              <Text
                color="dark.200"
                fontSize="sm"
                fontFamily="var(--font-cormorant), Georgia, serif"
                fontStyle="italic"
                mb={3}
              >
                {t("total")}
              </Text>
              <Text
                color="brand.300"
                fontSize={{ base: "lg", md: "xl" }}
                fontFamily="var(--font-jetbrains), monospace"
                fontWeight="300"
                letterSpacing="0.05em"
                wordBreak="break-all"
              >
                {symbols}
                <sup>{LIBRARY.pageLength}</sup>
              </Text>
              <Text
                color="dark.300"
                fontSize="xs"
                fontFamily="var(--font-jetbrains), monospace"
                fontWeight="300"
                mt={2}
              >
                {t.rich("approx", { mantissa, exponent: String(exponent), sup: (chunks) => <sup>{chunks}</sup> })}
              </Text>
            </Box>
          </motion.div>
        </MotionVStack>
      </Box>
    </div>
  );
}

function ExploreSection({ handleRandom, loading }: { handleRandom: () => void; loading: boolean }) {
  const t = useTranslations("Home.explore");
  const { ref, progress } = useSectionProgress();
          const titleY6 = useTransform(progress, [0, 1], [30, -30]);
          const cardsY6 = useTransform(progress, [0, 1], [50, -15]);
          const ctaY = useTransform(progress, [0, 1], [40, -20]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Box py={{ base: 16, md: 24 }} px={4}>
        <VStack gap={{ base: 10, md: 14 }} maxW="1000px" mx="auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            style={{ textAlign: "center", y: titleY6 }}
          >
            <Text
              color="dark.300"
              fontSize="10px"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.3em"
              fontFamily="var(--font-jetbrains), monospace"
              mb={3}
            >
              {t("kicker")}
            </Text>
            <Heading
              as="h2"
              fontSize={{ base: "2xl", md: "4xl" }}
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="400"
              letterSpacing="0.04em"
            >
              {t("title")}
            </Heading>
          </motion.div>

          <motion.div style={{ y: cardsY6, width: "100%" }}>
          <Flex gap={{ base: 4, md: 6 }} wrap="wrap" justify="center" w="100%">
            <NavCard
              title={t("searchTitle")}
              description={t("searchText")}
              href="/"
              icon={<SearchIcon />}
              delay={0}
            />
            <NavCard
              title={t("browseTitle")}
              description={t("browseText")}
              href="/browse"
              icon={<BookIcon />}
              delay={0.1}
            />
            <NavCard
              title={t("galleryTitle")}
              description={t("galleryText")}
              href="/explore/wall/1"
              icon={<CubeIcon />}
              delay={0.2}
            />
          </Flex>
          </motion.div>

          {/* Random page CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.6 }}
            style={{ textAlign: "center", y: ctaY }}
          >
            <motion.button
              onClick={handleRandom}
              disabled={loading}
              style={{
                background: "transparent",
                border: "1px solid rgba(201, 168, 76, 0.2)",
                color: "rgba(201, 168, 76, 0.7)",
                padding: "14px 36px",
                borderRadius: "8px",
                cursor: loading ? "wait" : "pointer",
                fontFamily: "var(--font-cormorant), Georgia, serif",
                fontSize: "18px",
                fontWeight: 400,
                letterSpacing: "0.08em",
                transition: "all 0.3s ease",
              }}
              whileHover={{
                borderColor: "rgba(201, 168, 76, 0.5)",
                color: "rgba(240, 228, 201, 1)",
                boxShadow: "0 0 30px rgba(201, 168, 76, 0.08)",
                y: -2,
              }}
              whileTap={{ scale: 0.97 }}
            >
              {loading ? t("opening") : t("random")}
            </motion.button>
          </motion.div>
        </VStack>
      </Box>
    </div>
  );
}

function HowItWorksSection() {
  const t = useTranslations("Home.how");
  const { ref, progress } = useSectionProgress();
          const titleY7 = useTransform(progress, [0, 1], [25, -25]);
          const stepsY = useTransform(progress, [0, 1], [40, -15]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Box py={{ base: 16, md: 24 }} px={4}>
        <MotionVStack
          gap={{ base: 10, md: 14 }}
          maxW="700px"
          mx="auto"
          textAlign="center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger(0.12)}
        >
          <motion.div variants={scrollFadeInUp} style={{ y: titleY7 }}>
            <Text
              color="dark.300"
              fontSize="10px"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.3em"
              fontFamily="var(--font-jetbrains), monospace"
              mb={3}
            >
              {t("kicker")}
            </Text>
            <Heading
              as="h2"
              fontSize={{ base: "2xl", md: "4xl" }}
              color="brand.300"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="400"
              letterSpacing="0.04em"
            >
              {t("title")}
            </Heading>
          </motion.div>

          <motion.div style={{ y: stepsY, width: "100%" }}>
          <VStack gap={8} w="100%" align="stretch">
            {[
              {
                step: "I",
                title: t("addressTitle"),
                text: t("addressText"),
              },
              {
                step: "II",
                title: t("determinismTitle"),
                text: t("determinismText"),
              },
              {
                step: "III",
                title: t("reversibilityTitle"),
                text: t("reversibilityText"),
              },
              {
                step: "IV",
                title: t("completenessTitle"),
                text: t("completenessText"),
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.7,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Flex
                  gap={5}
                  align="flex-start"
                  textAlign="left"
                  bg="rgba(17, 17, 25, 0.3)"
                  border="1px solid"
                  borderColor="rgba(201, 168, 76, 0.06)"
                  borderRadius="10px"
                  p={{ base: 5, md: 6 }}
                  transition="border-color 0.3s ease"
                  _hover={{ borderColor: "rgba(201, 168, 76, 0.15)" }}
                >
                  <Text
                    color="brand.300"
                    fontSize={{ base: "xl", md: "2xl" }}
                    fontFamily="var(--font-cormorant), Georgia, serif"
                    fontWeight="300"
                    minW="40px"
                    opacity={0.5}
                  >
                    {item.step}
                  </Text>
                  <VStack gap={1} align="flex-start">
                    <Text
                      color="parchment.200"
                      fontSize="md"
                      fontWeight="500"
                      fontFamily="var(--font-cormorant), Georgia, serif"
                      letterSpacing="0.03em"
                    >
                      {item.title}
                    </Text>
                    <Text
                      color="dark.200"
                      fontSize="sm"
                      lineHeight="1.7"
                      fontFamily="var(--font-cormorant), Georgia, serif"
                    >
                      {item.text}
                    </Text>
                  </VStack>
                </Flex>
              </motion.div>
            ))}
          </VStack>
          </motion.div>
        </MotionVStack>
      </Box>
    </div>
  );
}

function FinalQuoteSection() {
  const t = useTranslations("Home.finalQuote");
  const { ref, progress } = useSectionProgress();
          const finalY = useTransform(progress, [0, 1], [30, -20]);
          const finalScale = useTransform(progress, [0, 0.5, 1], [0.96, 1, 0.98]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Box py={{ base: 16, md: 24 }} px={4}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.5 }}
          style={{ y: finalY, scale: finalScale }}
        >
          <VStack gap={6} maxW="600px" mx="auto" textAlign="center">
            <AnimatedOrnament />
            <Text
              color="parchment.200"
              fontSize={{ base: "lg", md: "2xl" }}
              lineHeight="2"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontStyle="italic"
              fontWeight="300"
            >
              {t("text")}
            </Text>
            <Text
              color="dark.300"
              fontSize="xs"
              fontFamily="var(--font-jetbrains), monospace"
              fontWeight="300"
              letterSpacing="0.1em"
            >
              {t("source")}
            </Text>
          </VStack>
        </motion.div>
      </Box>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════ */

export default function Home() {
  const t = useTranslations("Home.hero");
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  // Multi-speed parallax layers for hero
  const heroParallaxSlow = useTransform(scrollYProgress, [0, 1], [0, -30]);
  const heroParallaxMed = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const heroParallaxFast = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const heroGlowScale = useTransform(scrollYProgress, [0, 1], [1, 1.3]);

  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % quotes.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const handleRandom = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/random");
      const data = await res.json();
      if (data.address) {
        router.push(`/page/${encodeURIComponent(data.address)}`);
      }
    } catch (err) {
      console.error("Random page error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      {/* ═══ SECTION 1: HERO ═══ */}
      <Box ref={heroRef} position="relative" minH="100vh" overflow="hidden">
        {/* Painted galleries behind the title */}
        <motion.div
          style={{ position: "absolute", inset: 0, y: heroParallaxSlow, scale: heroGlowScale }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2.4, ease: "easeOut" }}
        >
          <Image src="/textures/hero.webp" alt="" fill priority sizes="100vw" style={{ objectFit: "cover", objectPosition: "center 40%", opacity: 0.32 }} />
          <Box
            position="absolute"
            inset={0}
            bg="linear-gradient(180deg, rgba(8,8,15,0.55) 0%, rgba(8,8,15,0.25) 35%, rgba(8,8,15,0.65) 75%, #08080f 100%), radial-gradient(ellipse 70% 60% at 50% 45%, rgba(8,8,15,0) 0%, rgba(8,8,15,0.6) 100%)"
          />
        </motion.div>
        {/* Radial glow behind title */}
        <motion.div
          style={{
            position: "absolute",
            top: "20%",
            left: "50%",
            width: "80vw",
            height: "60vh",
            transform: "translateX(-50%)",
            background:
              "radial-gradient(ellipse at center, rgba(201, 168, 76, 0.04) 0%, transparent 70%)",
            pointerEvents: "none",
            scale: heroGlowScale,
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            minH="100vh"
            px={4}
            py={16}
          >
            <MotionVStack
              gap={{ base: 8, md: 12 }}
              maxW="800px"
              textAlign="center"
              variants={stagger(0.18)}
              initial="hidden"
              animate="visible"
            >
              {/* Subtitle — moves faster up */}
              <motion.div style={{ y: heroParallaxFast }}>
                <MotionText
                  color="dark.300"
                  fontSize="11px"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.4em"
                  fontFamily="var(--font-jetbrains), monospace"
                  variants={fadeInUp}
                >
                  {t("kicker")}
                </MotionText>
              </motion.div>

              {/* Title — anchored, barely moves */}
              <motion.div variants={fadeInUp}>
                <Heading
                  as="h1"
                  fontSize={{ base: "4xl", md: "6xl", lg: "7xl" }}
                  fontFamily="var(--font-cormorant), Georgia, serif"
                  fontWeight="400"
                  lineHeight="1.05"
                  letterSpacing="0.05em"
                  className="shimmer-text"
                >
                  {t("titleLine1")}
                  <br />
                  {t("titleLine2")}
                </Heading>
              </motion.div>

              {/* Ornament */}
              <motion.div variants={fadeInUp}>
                <AnimatedOrnament />
              </motion.div>

              {/* Epigraph — slight parallax */}
              <motion.div style={{ y: heroParallaxSlow }}>
                <MotionText
                  color="dark.100"
                  fontSize={{ base: "lg", md: "xl" }}
                  lineHeight="2"
                  maxW="580px"
                  fontFamily="var(--font-cormorant), Georgia, serif"
                  fontStyle="italic"
                  fontWeight="300"
                  variants={fadeInUp}
                >
                  {t("epigraph")}
                </MotionText>
              </motion.div>

              {/* Stats row — moves at medium speed */}
              <motion.div style={{ y: heroParallaxMed }}>
                <MotionBox
                  display="flex"
                  gap={{ base: 3, md: 0 }}
                  flexWrap="wrap"
                  justifyContent="center"
                  variants={fadeInUp}
                >
                  {[
                    { value: "∞", label: t("galleries") },
                    { value: String(LIBRARY.walls), label: t("walls", { count: LIBRARY.walls }) },
                    { value: String(LIBRARY.shelves), label: t("shelves", { count: LIBRARY.shelves }) },
                    { value: String(LIBRARY.volumes), label: t("volumes", { count: LIBRARY.volumes }) },
                    { value: String(LIBRARY.pages), label: t("pages", { count: LIBRARY.pages }) },
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
                            fontSize={{ base: "xl", md: "2xl" }}
                            fontWeight="400"
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
              </motion.div>
            </MotionVStack>
          </Box>
        </motion.div>

        <ScrollIndicator />
      </Box>

      {/* ═══ SECTION 2: SEARCH ═══ */}
      <SearchSection />

      <SectionOrnament />

      {/* ═══ SECTION 3: ROTATING QUOTES ═══ */}
      <QuotesSection quoteIndex={quoteIndex} setQuoteIndex={setQuoteIndex}/>

      <SectionOrnament />

      {/* ═══ SECTION 4: STRUCTURE OF THE LIBRARY ═══ */}
      <StructureSection />

      <SectionOrnament />

      {/* ═══ SECTION 5: MIND-BENDING NUMBERS ═══ */}
      <NumbersSection />

      <SectionOrnament />

      {/* ═══ SECTION 6: EXPLORE THE LIBRARY ═══ */}
      <ExploreSection handleRandom={handleRandom} loading={loading}/>

      <SectionOrnament />

      {/* ═══ SECTION 7: HOW IT WORKS ═══ */}
      <HowItWorksSection />

      {/* ═══ FINAL QUOTE ═══ */}
      <FinalQuoteSection />

      <Box h={16} />
    </PageTransition>
  );
}
