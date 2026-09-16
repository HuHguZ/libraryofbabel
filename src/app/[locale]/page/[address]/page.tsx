"use client";

import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box, Flex, Input, Text } from "@chakra-ui/react";
import { AnimatePresence, motion } from "motion/react";
import PageTransition from "@/components/PageTransition";
import ExploreHud, { ExploreStage, HudButton } from "@/components/explore/ExploreHud";
import BookPage from "@/components/BookPage";
import AddressDisplay from "@/components/AddressDisplay";
import LibraryNav from "@/components/LibraryNav";
import { useLocalizedPath, useRouter } from "@/i18n/navigation";
import { findMatches, normalizeQuery } from "@/lib/alphabet";
import { hashString, shortHex } from "@/lib/hex";
import { LIBRARY, clampInt, isValidHex } from "@/lib/library";

const SceneWrapper = dynamic(() => import("@/components/explore/SceneWrapper"), { ssr: false });
const ReaderScene = dynamic(() => import("@/components/explore/ReaderScene"), { ssr: false });

const mono = "var(--font-jetbrains), monospace";
const serif = "var(--font-cormorant), Georgia, serif";
const LAST_SPREAD = Math.floor(LIBRARY.pages / 2);

interface Address {
  hex: string;
  wall: number;
  shelf: number;
  volume: number;
  page: number;
}

function parseAddress(raw: string): Address | null {
  const parts = raw.split("-");
  if (parts.length < 5) return null;
  const [hex, wall, shelf, volume, page] = parts;
  if (!isValidHex(hex)) return null;
  return {
    hex,
    wall: clampInt(wall, 1, LIBRARY.walls),
    shelf: clampInt(shelf, 1, LIBRARY.shelves),
    volume: clampInt(volume, 1, LIBRARY.volumes),
    page: clampInt(page, 1, LIBRARY.pages),
  };
}

const formatAddress = (a: Address) => `${a.hex}-${a.wall}-${a.shelf}-${a.volume}-${a.page}`;

/** Pages of spread k (page 0 is the title page and has no text). */
function spreadPages(k: number): number[] {
  return [2 * k, 2 * k + 1].filter((p) => p >= 1 && p <= LIBRARY.pages);
}

/** The volume before / after this one, walking the shelves of the gallery. */
function neighbourVolume(a: Address, dir: 1 | -1): Address | null {
  const { wall, shelf, volume } = a;
  if (dir === 1) {
    if (volume < LIBRARY.volumes) return { ...a, volume: volume + 1, page: 1 };
    if (shelf < LIBRARY.shelves) return { ...a, shelf: shelf + 1, volume: 1, page: 1 };
    if (wall < LIBRARY.walls) return { ...a, wall: wall + 1, shelf: 1, volume: 1, page: 1 };
    return null;
  }
  if (volume > 1) return { ...a, volume: volume - 1, page: LIBRARY.pages };
  if (shelf > 1) return { ...a, shelf: shelf - 1, volume: LIBRARY.volumes, page: LIBRARY.pages };
  if (wall > 1) return { ...a, wall: wall - 1, shelf: LIBRARY.shelves, volume: LIBRARY.volumes, page: LIBRARY.pages };
  return null;
}

export default function PageView() {
  const t = useTranslations("Reader");
  const locale = useLocale();
  const params = useParams();
  const searchParams = useSearchParams();
  const raw = decodeURIComponent(String(params.address ?? ""));
  const address = useMemo(() => parseAddress(raw), [raw]);
  const initialQuery = normalizeQuery(searchParams.get("q") ?? "", locale).trim();

  if (!address) {
    return (
      <Box maxW="640px" mx="auto" px={4} py={20} textAlign="center">
        <Text color="brand.300" fontSize="2xl" fontFamily={serif}>
          {t("notFoundTitle")}
        </Text>
        <Text color="dark.100" mt={3} fontFamily={serif} fontStyle="italic">
          {t("notFoundText")}
        </Text>
      </Box>
    );
  }
  return <Reader key={raw} address={address} initialQuery={initialQuery} />;
}

function Reader({ address, initialQuery }: { address: Address; initialQuery: string }) {
  const t = useTranslations("Reader");
  const explore = useTranslations("Explore");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const localizedPath = useLocalizedPath();
  const [spread, setSpread] = useState(Math.floor(address.page / 2));
  const [contents, setContents] = useState<Record<number, string>>({});
  const [title, setTitle] = useState("");
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [textOpen, setTextOpen] = useState(false);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [ready, setReady] = useState(false);
  const loadedRef = useRef(new Map<number, string>());
  const inFlightRef = useRef(new Set<number>());

  const seed = useMemo(() => hashString(address.hex), [address.hex]);
  const hexQuery = `?hex=${encodeURIComponent(address.hex)}`;

  // Fetch the pages of a spread and its neighbours in one request; page turns never wait for the network.
  useEffect(() => {
    const inFlight = inFlightRef.current;
    const wanted = [spread - 1, spread, spread + 1].filter((k) => k >= 0 && k <= LAST_SPREAD).flatMap(spreadPages);
    const missing = wanted.filter((p) => !loadedRef.current.has(p) && !inFlight.has(p));
    if (missing.length === 0) return;
    missing.forEach((p) => inFlight.add(p));
    const controller = new AbortController();
    fetch("/api/spread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hex: address.hex, wall: address.wall, shelf: address.shelf, volume: address.volume, pages: missing, lang: locale }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { title?: string; pages?: { page: number; content: string }[] }) => {
        if (typeof data.title === "string") setTitle(data.title);
        if (Array.isArray(data.pages)) {
          data.pages.forEach((p) => loadedRef.current.set(p.page, p.content));
          setContents(Object.fromEntries(loadedRef.current));
        }
      })
      .catch(() => {
        /* aborted or offline */
      })
      .finally(() => {
        if (!controller.signal.aborted) missing.forEach((p) => inFlight.delete(p));
      });
    return () => {
      // An aborted request leaves its pages free to be asked for again (React re-runs effects in development).
      controller.abort();
      missing.forEach((p) => inFlight.delete(p));
    };
  }, [spread, address, locale]);

  // The address in the URL follows the open spread (its right page).
  useEffect(() => {
    const page = Math.min(LIBRARY.pages, Math.max(1, 2 * spread + 1));
    const q = query ? `?q=${encodeURIComponent(query)}` : "";
    window.history.replaceState(null, "", localizedPath(`/page/${encodeURIComponent(formatAddress({ ...address, page }))}${q}`));
  }, [spread, query, address, localizedPath]);

  // Highlight what is typed, a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(normalizeQuery(input, locale).trim()), 250);
    return () => clearTimeout(timer);
  }, [input, locale]);

  useEffect(() => {
    if (!ready || !showHint) return;
    const timer = setTimeout(() => setShowHint(false), 12000);
    return () => clearTimeout(timer);
  }, [ready, showHint]);

  const go = useCallback(
    (dir: 1 | -1) => {
      setShowHint(false);
      const next = spread + dir;
      if (next >= 0 && next <= LAST_SPREAD) {
        setSpread(next);
        return;
      }
      // Past the covers: the next or previous volume on the shelf.
      const other = neighbourVolume(address, dir);
      if (other) {
        const q = query ? `?q=${encodeURIComponent(query)}` : "";
        router.push(`/page/${encodeURIComponent(formatAddress(other))}${q}`);
      }
    },
    [spread, address, query, router]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "ArrowRight" || e.code === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.code === "ArrowLeft" || e.code === "PageUp") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const onHoverPage = useCallback((which: "prev" | "next" | null) => {
    setTooltip(which === "next" ? t("tooltipNext") : which === "prev" ? t("tooltipPrev") : null);
  }, [t]);

  const pages = spreadPages(spread);
  const loaded = pages.every((p) => contents[p] !== undefined);
  const matches = query ? pages.reduce((n, p) => n + findMatches(contents[p] ?? "", query).length, 0) : 0;
  const focusToken = `${query}|${spread}|${loaded ? "ready" : "wait"}`;
  const label = spread === 0 ? t("titlePage") : t("spreadPages", { from: 2 * spread, to: Math.min(LIBRARY.pages, 2 * spread + 1) });
  const shownTitle = title.trim() ? common("quoted", { text: title.trim() }) : common("volumeN", { n: address.volume });
  const currentAddress = formatAddress({ ...address, page: Math.min(LIBRARY.pages, Math.max(1, 2 * spread + 1)) });

  return (
    <PageTransition>
      <ExploreStage>
        <SceneWrapper seed={seed} onReady={() => setReady(true)}>
          <ReaderScene
            title={title}
            wall={address.wall}
            shelf={address.shelf}
            volume={address.volume}
            spread={spread}
            contents={contents}
            query={query}
            focusToken={focusToken}
            onHoverPage={onHoverPage}
            onTurn={go}
            onInteract={() => setShowHint(false)}
          />
        </SceneWrapper>

        <ExploreHud
          kicker={t("kicker", { wall: address.wall, shelf: address.shelf })}
          title={shownTitle}
          galleryLabel={shortHex(address.hex)}
          back={{ href: `/explore/wall/${address.wall}/shelf/${address.shelf}/volume/${address.volume}${hexQuery}`, label: explore("backVolume", { n: address.volume }) }}
          showHint={ready && showHint}
          hint={
            <>
              {t("hint")}
              <Box as="span" display={{ base: "none", md: "inline" }}>{t("hintDesktop")}</Box>
            </>
          }
          tooltip={tooltip}
          extra={
            <AnimatePresence>
              {textOpen && (
                <motion.div
                  key="text"
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 40, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(600px, 100%)", zIndex: 8 }}
                >
                  <Box h="100%" overflowY="auto" bg="rgba(7,6,10,0.94)" backdropFilter="blur(12px)" borderLeft="1px solid" borderColor="brand.300/25" px={{ base: 4, md: 6 }} py={5}>
                    <Flex justify="space-between" align="center" mb={4}>
                      <Text color="dark.100" fontSize="10px" textTransform="uppercase" letterSpacing="0.25em" fontFamily={mono}>
                        {t("spreadText")}
                      </Text>
                      <HudButton onClick={() => setTextOpen(false)}>{t("close")}</HudButton>
                    </Flex>
                    <Box mb={5}>
                      <LibraryNav wall={address.wall} shelf={address.shelf} volume={address.volume} page={Math.min(LIBRARY.pages, 2 * spread + 1)} addressHex={address.hex} />
                    </Box>
                    {pages.map((p) => (
                      <Box key={p} mb={6}>
                        <Text color="brand.200/80" fontSize="xs" fontFamily={mono} mb={2} letterSpacing="0.1em">
                          {common("pageN", { n: p })}
                        </Text>
                        <BookPage content={contents[p] ?? ""} highlight={query || undefined} />
                      </Box>
                    ))}
                    <AddressDisplay address={currentAddress} />
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>
          }
        >
          <Flex align="center" gap={2} flexWrap="wrap" justify="center">
            <HudButton onClick={() => go(-1)} title={t("prevTitle")}>
              {t("prev")}
            </HudButton>
            <Text color="dark.50" fontSize="xs" fontFamily={mono} px={2} whiteSpace="nowrap">
              {label} <Box as="span" color="dark.200">/ {LIBRARY.pages}</Box>
            </Text>
            <HudButton onClick={() => go(1)} title={t("nextTitle")}>
              {t("next")}
            </HudButton>
            <Box w="1px" h="20px" bg="dark.400/50" mx={1} display={{ base: "none", sm: "block" }} />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("findPlaceholder")}
              size="xs"
              w={{ base: "150px", md: "200px" }}
              bg="rgba(7,6,10,0.6)"
              border="1px solid"
              borderColor="dark.400/50"
              color="parchment.200"
              fontFamily={mono}
              fontSize="xs"
              borderRadius="4px"
              _placeholder={{ color: "dark.200" }}
              _focus={{ borderColor: "brand.300/60", boxShadow: "none" }}
            />
            {query && (
              <Text color={matches ? "brand.200" : "dark.200"} fontSize="xs" fontFamily={mono} whiteSpace="nowrap">
                {matches ? t("found", { count: matches }) : t("notOnSpread")}
              </Text>
            )}
            <HudButton active={textOpen} onClick={() => setTextOpen((o) => !o)}>
              {t("textAndAddress")}
            </HudButton>
          </Flex>
        </ExploreHud>
      </ExploreStage>
    </PageTransition>
  );
}
