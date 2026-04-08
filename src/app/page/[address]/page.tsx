"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Box, VStack, Heading, Text, Spinner, Link as ChakraLink } from "@chakra-ui/react";
import { motion } from "framer-motion";
import NextLink from "next/link";
import BookPage from "@/components/BookPage";
import LibraryNav from "@/components/LibraryNav";
import AddressDisplay from "@/components/AddressDisplay";
import PageNavigation from "@/components/PageNavigation";
import AnimatedOrnament from "@/components/AnimatedOrnament";
import PageTransition from "@/components/PageTransition";
import { fadeInUp, fadeIn, stagger, bookReveal, slideInLeft } from "@/lib/animations";

const MotionBox = motion.create(Box);
const MotionVStack = motion.create(VStack);

export default function PageView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const address = decodeURIComponent(params.address as string);
  const searchQuery = searchParams.get("q") ?? "";

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState({ wall: 0, shelf: 0, volume: 0, page: 0 });
  const [loading, setLoading] = useState(true);

  // Extract hex part of address (everything before the last 4 dash-separated numbers)
  const addressParts = address.split("-");
  const addressHex = addressParts.slice(0, -4).join("-");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [pageRes, titleRes] = await Promise.all([
          fetch("/api/page", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address }),
          }),
          fetch("/api/title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address }),
          }),
        ]);
        const pageData = await pageRes.json();
        const titleData = await titleRes.json();
        setContent(pageData.content || "");
        setLocation({
          wall: pageData.wall,
          shelf: pageData.shelf,
          volume: pageData.volume,
          page: pageData.page,
        });
        setTitle(titleData.title || "");
      } catch (err) {
        console.error("Failed to load page:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [address]);

  if (loading) {
    return (
      <Box minH="60vh" display="flex" alignItems="center" justifyContent="center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <VStack gap={4}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Spinner size="lg" color="brand.300" borderWidth="2px" />
            </motion.div>
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Text
                color="dark.300"
                fontSize="sm"
                fontFamily="var(--font-cormorant), Georgia, serif"
                fontStyle="italic"
              >
                Загрузка страницы...
              </Text>
            </motion.div>
          </VStack>
        </motion.div>
      </Box>
    );
  }

  return (
    <PageTransition>
      <Box maxW="1000px" mx="auto" px={4} py={8}>
        <MotionVStack
          gap={8}
          align="stretch"
          variants={stagger(0.12)}
          initial="hidden"
          animate="visible"
        >
          {/* Back link */}
          <MotionBox variants={slideInLeft}>
            <ChakraLink
              asChild
              color="dark.300"
              fontSize="sm"
              fontFamily="var(--font-jetbrains), monospace"
              fontWeight="300"
              letterSpacing="0.02em"
              transition="color 0.2s ease"
              _hover={{ color: "brand.300", textDecoration: "none" }}
            >
              <NextLink href="/">
                <motion.span
                  whileHover={{ x: -4 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: "inline-block" }}
                >
                  ← назад
                </motion.span>
              </NextLink>
            </ChakraLink>
          </MotionBox>

          {/* Title */}
          <MotionBox textAlign="center" variants={fadeInUp}>
            <Text
              color="dark.300"
              fontSize="10px"
              textTransform="uppercase"
              letterSpacing="0.15em"
              fontFamily="var(--font-jetbrains), monospace"
              fontWeight="500"
              mb={2}
            >
              Заголовок
            </Text>
            <Heading
              as="h2"
              fontSize={{ base: "xl", md: "2xl" }}
              color="parchment.200"
              fontFamily="var(--font-cormorant), Georgia, serif"
              fontWeight="500"
              letterSpacing="0.03em"
            >
              {title}
            </Heading>
            <Box mt={3}>
              <AnimatedOrnament />
            </Box>
          </MotionBox>

          {/* Location */}
          <MotionBox variants={fadeInUp}>
            <LibraryNav
              wall={location.wall}
              shelf={location.shelf}
              volume={location.volume}
              page={location.page}
              addressHex={addressHex}
            />
          </MotionBox>

          {/* Page content — book reveal effect */}
          <MotionBox variants={bookReveal} style={{ perspective: 1000 }}>
            <BookPage content={content} highlight={searchQuery} />
          </MotionBox>

          {/* Page navigation arrows */}
          <MotionBox variants={fadeInUp}>
            <PageNavigation
              wall={location.wall}
              shelf={location.shelf}
              volume={location.volume}
              page={location.page}
              addressHex={addressHex}
            />
          </MotionBox>

          {/* Address */}
          <MotionBox variants={fadeInUp}>
            <AddressDisplay address={address} />
          </MotionBox>
        </MotionVStack>
      </Box>
    </PageTransition>
  );
}
