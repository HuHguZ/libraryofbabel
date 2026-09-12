"use client";

import { Box, Flex, Text, Link as ChakraLink, chakra } from "@chakra-ui/react";
import NextLink from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/** Full-bleed container for an immersive scene: fills the viewport below the header. */
export function ExploreStage({ children }: { children: ReactNode }) {
  return (
    <Box
      position="relative"
      w="100%"
      h="calc(100dvh - var(--header-h))"
      minH="440px"
      overflow="hidden"
      bg="#07060a"
      userSelect="none"
      css={{ WebkitTapHighlightColor: "transparent" }}
    >
      {children}
    </Box>
  );
}

const mono = "var(--font-jetbrains), monospace";
const serif = "var(--font-cormorant), Georgia, serif";

export interface ExploreHudProps {
  kicker: string;
  title: string;
  galleryLabel?: string;
  back: { href: string; label: string };
  hint?: ReactNode;
  showHint?: boolean;
  tooltip?: string | null;
  /** Where the tooltip sits: next to the pointer, or under the centre reticle. */
  tooltipAnchor?: "pointer" | "center";
  /** Centre reticle shown while the pointer is captured; "active" when aiming at something clickable. */
  reticle?: "idle" | "active" | null;
  /** Small persistent line at the bottom, e.g. how to take control of the view. */
  lockHint?: string | null;
  banner?: string | null;
  /** Bottom row: wall / shelf selectors, breadcrumbs. */
  children?: ReactNode;
  /** Extra layers (panels, drawers) rendered above the scene. */
  extra?: ReactNode;
}

const lastPointer = { x: -1000, y: -1000 };
if (typeof window !== "undefined") {
  window.addEventListener("pointermove", (e) => {
    lastPointer.x = e.clientX;
    lastPointer.y = e.clientY;
  });
}

function TooltipBubble({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <Box
        bg="rgba(10, 8, 6, 0.86)"
        border="1px solid"
        borderColor="brand.300/35"
        borderRadius="4px"
        px={3}
        py={1.5}
        backdropFilter="blur(8px)"
        boxShadow="0 6px 24px rgba(0,0,0,0.5)"
        maxW="320px"
      >
        <Text color="parchment.100" fontSize="sm" fontFamily={serif} lineHeight="1.35" whiteSpace="nowrap">
          {text}
        </Text>
      </Box>
    </motion.div>
  );
}

function PointerTooltip({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = (x: number, y: number) => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.min(x + 18, window.innerWidth - w - 8);
      const top = y + 22 + h > window.innerHeight ? y - h - 12 : y + 22;
      el.style.transform = `translate(${left}px, ${top}px)`;
    };
    place(lastPointer.x, lastPointer.y);
    const onMove = (e: PointerEvent) => place(e.clientX, e.clientY);
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 20,
        pointerEvents: "none",
        transform: "translate(-1000px, -1000px)",
      }}
    >
      <TooltipBubble text={text} />
    </div>
  );
}

function CenterTooltip({ text }: { text: string }) {
  return (
    <Box position="absolute" left="50%" top="calc(50% + 26px)" transform="translateX(-50%)" zIndex={20} pointerEvents="none">
      <TooltipBubble text={text} />
    </Box>
  );
}

function Reticle({ state }: { state: "idle" | "active" }) {
  const active = state === "active";
  return (
    <Box position="absolute" left="50%" top="50%" zIndex={20} pointerEvents="none" transform="translate(-50%, -50%)">
      <Box
        w={active ? "18px" : "12px"}
        h={active ? "18px" : "12px"}
        borderRadius="50%"
        border="1.5px solid"
        borderColor={active ? "rgba(240, 216, 144, 0.95)" : "rgba(240, 228, 201, 0.65)"}
        boxShadow={active ? "0 0 12px rgba(201, 168, 76, 0.6)" : "0 0 6px rgba(0,0,0,0.6)"}
        transition="all 0.15s ease"
        position="relative"
      >
        <Box
          position="absolute"
          left="50%"
          top="50%"
          w="2px"
          h="2px"
          borderRadius="50%"
          bg={active ? "rgba(240, 216, 144, 1)" : "rgba(240, 228, 201, 0.8)"}
          transform="translate(-50%, -50%)"
        />
      </Box>
    </Box>
  );
}

export default function ExploreHud({
  kicker,
  title,
  galleryLabel,
  back,
  hint,
  showHint = true,
  tooltip,
  tooltipAnchor = "pointer",
  reticle,
  lockHint,
  banner,
  children,
  extra,
}: ExploreHudProps) {
  return (
    <>
      {/* Soft vignette so the chrome reads over any scene */}
      <Box
        position="absolute"
        inset={0}
        pointerEvents="none"
        zIndex={4}
        bg="linear-gradient(180deg, rgba(7,6,10,0.55) 0%, rgba(7,6,10,0) 22%, rgba(7,6,10,0) 70%, rgba(7,6,10,0.6) 100%)"
      />

      {/* Top row */}
      <Flex position="absolute" top={0} left={0} right={0} px={{ base: 4, md: 6 }} pt={{ base: 3, md: 4 }} zIndex={5} align="flex-start" justify="space-between" pointerEvents="none">
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }} style={{ pointerEvents: "auto" }}>
          <ChakraLink asChild color="dark.100" fontSize="sm" fontFamily={mono} fontWeight="300" letterSpacing="0.02em" _hover={{ color: "brand.300", textDecoration: "none" }}>
            <NextLink href={back.href}>← {back.label}</NextLink>
          </ChakraLink>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} style={{ textAlign: "center" }}>
          <Text color="dark.100" fontSize="10px" textTransform="uppercase" letterSpacing="0.28em" fontFamily={mono} fontWeight="500">
            {kicker}
          </Text>
          <Text color="brand.300" fontSize={{ base: "xl", md: "3xl" }} fontFamily={serif} fontWeight="500" letterSpacing="0.04em" lineHeight="1.1" mt={1} textShadow="0 2px 18px rgba(0,0,0,0.6)">
            {title}
          </Text>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }} style={{ textAlign: "right", minWidth: 90 }}>
          {galleryLabel && (
            <>
              <Text color="dark.200" fontSize="9px" textTransform="uppercase" letterSpacing="0.2em" fontFamily={mono} display={{ base: "none", sm: "block" }}>
                галерея
              </Text>
              <Text color="brand.200/70" fontSize="xs" fontFamily={mono} display={{ base: "none", sm: "block" }}>
                {galleryLabel}
              </Text>
            </>
          )}
        </motion.div>
      </Flex>

      {/* Bottom row */}
      <Flex position="absolute" bottom={0} left={0} right={0} direction="column" align="center" gap={3} px={4} pb={{ base: 4, md: 6 }} zIndex={5} pointerEvents="none">
        <AnimatePresence>
          {hint && showHint && (
            <motion.div key="hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.5 }}>
              <Text color="dark.50" fontSize={{ base: "xs", md: "sm" }} fontFamily={serif} fontStyle="italic" textAlign="center" lineHeight="1.6" maxW="680px" textShadow="0 1px 8px rgba(0,0,0,0.8)">
                {hint}
              </Text>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {lockHint && (
            <motion.div key="lock" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.35 }}>
              <Box px={4} py={1.5} borderRadius="999px" bg="rgba(7,6,10,0.6)" border="1px solid" borderColor="brand.300/30" backdropFilter="blur(6px)">
                <Text color="parchment.200" fontSize="xs" fontFamily={mono} letterSpacing="0.04em" textAlign="center">
                  {lockHint}
                </Text>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
        {children && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }} style={{ pointerEvents: "auto" }}>
            {children}
          </motion.div>
        )}
      </Flex>

      {/* Transient banner */}
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 6, pointerEvents: "none" }}
          >
            <Box px={8} py={4} bg="rgba(7,6,10,0.7)" border="1px solid" borderColor="brand.300/30" borderRadius="6px" backdropFilter="blur(6px)">
              <Text color="parchment.100" fontSize={{ base: "lg", md: "2xl" }} fontFamily={serif} fontStyle="italic" textAlign="center">
                {banner}
              </Text>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {reticle && <Reticle state={reticle} />}
      {tooltip && (tooltipAnchor === "center" ? <CenterTooltip text={tooltip} /> : <PointerTooltip text={tooltip} />)}
      {extra}
    </>
  );
}

/** A row of small numbered buttons (walls, shelves). */
export function HudSelector({ items, active, hrefFor, onSelect, label }: { items: number[]; active: number; hrefFor?: (n: number) => string; onSelect?: (n: number) => void; label: string }) {
  return (
    <Flex align="center" gap={2} flexWrap="wrap" justify="center">
      <Text color="dark.100" fontSize="10px" textTransform="uppercase" letterSpacing="0.2em" fontFamily={mono} mr={1}>
        {label}
      </Text>
      {items.map((n) => {
        const isActive = n === active;
        const inner = (
          <Box
            as={onSelect && !hrefFor ? "button" : undefined}
            px={3}
            py={1.5}
            minW="38px"
            textAlign="center"
            borderRadius="4px"
            bg={isActive ? "brand.300/18" : "rgba(7,6,10,0.55)"}
            border="1px solid"
            borderColor={isActive ? "brand.300/60" : "dark.400/50"}
            color={isActive ? "brand.200" : "dark.50"}
            fontSize="sm"
            fontFamily={mono}
            cursor="pointer"
            transition="all 0.2s ease"
            backdropFilter="blur(6px)"
            _hover={{ bg: "brand.300/12", borderColor: "brand.300/40", color: "brand.200" }}
            onClick={onSelect ? () => onSelect(n) : undefined}
          >
            {n}
          </Box>
        );
        return hrefFor ? (
          <NextLink key={n} href={hrefFor(n)} style={{ textDecoration: "none" }}>
            {inner}
          </NextLink>
        ) : (
          <motion.div key={n} whileTap={{ scale: 0.94 }}>
            {inner}
          </motion.div>
        );
      })}
    </Flex>
  );
}

/** Small translucent HUD button. */
export function HudButton({ children, onClick, active, disabled, title }: { children: ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; title?: string }) {
  return (
    <chakra.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      px={3}
      py={1.5}
      borderRadius="4px"
      bg={active ? "brand.300/18" : "rgba(7,6,10,0.55)"}
      border="1px solid"
      borderColor={active ? "brand.300/60" : "dark.400/50"}
      color={active ? "brand.200" : "dark.50"}
      fontSize="xs"
      fontFamily={mono}
      cursor={disabled ? "default" : "pointer"}
      opacity={disabled ? 0.4 : 1}
      backdropFilter="blur(6px)"
      transition="all 0.2s ease"
      whiteSpace="nowrap"
      _hover={disabled ? undefined : { color: "brand.200", borderColor: "brand.300/40", bg: "brand.300/12" }}
    >
      {children}
    </chakra.button>
  );
}
