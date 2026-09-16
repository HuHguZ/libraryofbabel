"use client";

import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box, Flex, Input, Text } from "@chakra-ui/react";
import { AnimatePresence } from "motion/react";
import PageTransition from "@/components/PageTransition";
import ExploreHud, { ExploreStage, HudButton } from "@/components/explore/ExploreHud";
import ReaderTextPanel from "@/components/explore/ReaderTextPanel";
import { useLoupe } from "@/components/explore/loupe/useLoupe";
import { useLocalizedPath, useRouter } from "@/i18n/navigation";
import { normalizeQuery } from "@/lib/alphabet";
import { formatFragment, fragmentReducer, parseFragment, shownFragment, type TextFragment } from "@/lib/fragment";
import { hashString, shortHex } from "@/lib/hex";
import { spreadMatches, stepMatch } from "@/lib/matches";
import { useFragmentColor } from "@/lib/fragmentColor";
import { LIBRARY, clampInt, isValidHex } from "@/lib/library";

const SceneWrapper = dynamic(() => import("@/components/explore/SceneWrapper"), { ssr: false });
const ReaderScene = dynamic(() => import("@/components/explore/ReaderScene"), { ssr: false });
const Loupe = dynamic(() => import("@/components/explore/loupe/Loupe"), { ssr: false });

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

/** Right page of spread k: the page its address names. */
const rightPage = (k: number) => Math.min(LIBRARY.pages, Math.max(1, 2 * k + 1));

/**
 * Link to a spread, with the phrase searched for and the marked fragment when it lies on this spread
 * (`?text=<page>:<start>-<end>`). Such a link names the fragment's own page, so it opens at the same spread.
 */
function readerHref(address: Address, spread: number, query: string, fragment: TextFragment | null): string {
  const shown = fragment && spreadPages(spread).includes(fragment.page) ? fragment : null;
  const params = [query ? `q=${encodeURIComponent(query)}` : "", shown ? `text=${formatFragment(shown)}` : ""].filter(Boolean).join("&");
  return `/page/${encodeURIComponent(formatAddress({ ...address, page: shown ? shown.page : rightPage(spread) }))}${params ? `?${params}` : ""}`;
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
  const initialFragment = parseFragment(searchParams.get("text"));

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
  return <Reader key={raw} address={address} initialQuery={initialQuery} initialFragment={initialFragment} />;
}

function Reader({ address, initialQuery, initialFragment }: { address: Address; initialQuery: string; initialFragment: TextFragment | null }) {
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
  // A shared link to a fragment opens with the text beside the book.
  const [textOpen, setTextOpen] = useState(initialFragment !== null);
  // The marked fragment, and the part of the text being selected right now (it replaces the mark once the selection ends).
  const [fragments, dispatchFragment] = useReducer(fragmentReducer, { mark: initialFragment, live: null });
  const [fragmentColor] = useFragmentColor();
  // Each request to show the fragment (the link opening, "show"): the panel scrolls to it and the camera glides to it.
  const [fragmentFocus, setFragmentFocus] = useState(() => {
    const here = initialFragment !== null && Math.floor(initialFragment.page / 2) === Math.floor(address.page / 2);
    return { n: here ? 1 : 0, spread: Math.floor(address.page / 2) };
  });
  // Which occurrence of the phrase on the spread the reader stepped to; `step` counts the steps, for glides and scrolling.
  const [matchCursor, setMatchCursor] = useState({ key: "", index: 0, step: 0 });
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [ready, setReady] = useState(false);
  const loupe = useLoupe();
  const loadedRef = useRef(new Map<number, string>());
  const inFlightRef = useRef(new Set<number>());

  const seed = useMemo(() => hashString(address.hex), [address.hex]);
  const hexQuery = `?hex=${encodeURIComponent(address.hex)}`;

  // Fetch the pages of a spread and three spreads either way in one request; page turns never wait for the network.
  useEffect(() => {
    const inFlight = inFlightRef.current;
    const wanted = [spread, spread + 1, spread - 1, spread + 2, spread - 2, spread + 3, spread - 3].filter((k) => k >= 0 && k <= LAST_SPREAD).flatMap(spreadPages);
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

  // The address in the URL follows the open spread (its right page), once the pages stop flying:
  // browsers throttle history updates, and a held arrow key turns thirty pages a second.
  // A fragment marked on the open spread goes into it too, so the address bar holds the same link "link to fragment" copies.
  useEffect(() => {
    const timer = setTimeout(() => {
      window.history.replaceState(null, "", localizedPath(readerHref(address, spread, query, fragments.mark)));
    }, 300);
    return () => clearTimeout(timer);
  }, [spread, query, fragments.mark, address, localizedPath]);

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

  // Turns can come faster than renders (a held key, quick clicks): each one counts from the last, not from the last render.
  const spreadRef = useRef(spread);
  const leavingRef = useRef(false);
  const go = useCallback(
    (dir: 1 | -1) => {
      setShowHint(false);
      const next = spreadRef.current + dir;
      if (next >= 0 && next <= LAST_SPREAD) {
        // The selected text leaves the panel with its page, and the browser drops the selection without a
        // selectionchange event: what was selected is marked now, so the book and the panel keep showing it.
        dispatchFragment({ type: "settle" });
        spreadRef.current = next;
        setSpread(next);
        return;
      }
      // Past the covers: the next or previous volume on the shelf.
      const other = neighbourVolume(address, dir);
      if (other && !leavingRef.current) {
        leavingRef.current = true;
        const q = query ? `?q=${encodeURIComponent(query)}` : "";
        router.push(`/page/${encodeURIComponent(formatAddress(other))}${q}`);
      }
    },
    [address, query, router]
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

  // The selection is gone (a click elsewhere, the panel closing): what it covered stays marked.
  const onSelection = useCallback((selected: TextFragment | null) => dispatchFragment({ type: "select", fragment: selected }), []);

  /** Turns the selection into the mark right away and lets go of it. */
  const settleSelection = useCallback(() => {
    dispatchFragment({ type: "settle" });
    window.getSelection()?.removeAllRanges();
  }, []);

  const showFragment = useCallback(() => {
    const target = shownFragment(fragments);
    if (!target) return;
    settleSelection();
    setShowHint(false);
    const k = Math.floor(target.page / 2);
    if (k !== spreadRef.current) {
      spreadRef.current = k;
      setSpread(k);
    }
    setFragmentFocus((f) => ({ n: f.n + 1, spread: k }));
  }, [fragments, settleSelection]);

  const clearFragment = useCallback(() => {
    dispatchFragment({ type: "clear" });
    window.getSelection()?.removeAllRanges();
  }, []);

  /**
   * Enter / Shift+Enter and the arrows of the find bar. A phrase still being typed is looked for at once;
   * otherwise the next or previous occurrence on the spread, going round at the ends.
   */
  const stepSearch = (dir: 1 | -1) => {
    setShowHint(false);
    const typed = normalizeQuery(input, locale).trim();
    if (typed !== query) {
      setQuery(typed);
      return;
    }
    if (matches.length === 0) return;
    setMatchCursor((c) => ({ key: matchKey, index: stepMatch(matchIndex, matches.length, dir), step: c.step + 1 }));
  };

  const onHoverPage = useCallback((which: "prev" | "next" | null) => {
    setTooltip(which === "next" ? t("tooltipNext") : which === "prev" ? t("tooltipPrev") : null);
  }, [t]);

  const pages = spreadPages(spread);
  const loaded = pages.every((p) => contents[p] !== undefined);
  const matches = spreadMatches(pages, contents, query);
  // The occurrence the reader is at: the first one on a new spread or for a new phrase, until stepped from.
  const matchKey = `${query}|${spread}`;
  const matchIndex = matchCursor.key === matchKey ? Math.min(matchCursor.index, Math.max(0, matches.length - 1)) : 0;
  const currentMatch = matches[matchIndex] ?? null;
  const focusToken = `${query}|${spread}|${loaded ? "ready" : "wait"}|${matchIndex}`;
  const label = spread === 0 ? t("titlePage") : t("spreadPages", { from: 2 * spread, to: Math.min(LIBRARY.pages, 2 * spread + 1) });
  const shownTitle = title.trim() ? common("quoted", { text: title.trim() }) : common("volumeN", { n: address.volume });
  const currentAddress = formatAddress({ ...address, page: rightPage(spread) });
  const marked = shownFragment(fragments);
  const sharePath = marked ? localizedPath(readerHref(address, Math.floor(marked.page / 2), query, marked)) : "";
  // Rendered on the server too, where there is no origin; the link is only read when it is copied.
  const shareUrl = sharePath && typeof window !== "undefined" ? `${window.location.origin}${sharePath}` : sharePath;

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
            currentMatch={currentMatch}
            matchStep={matchCursor.step}
            mark={marked}
            markColor={fragmentColor}
            markFocusToken={fragmentFocus.n ? String(fragmentFocus.n) : undefined}
            onHoverPage={onHoverPage}
            onTurn={go}
            onInteract={() => setShowHint(false)}
          />
          <Loupe active={loupe.active} />
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
          // The loupe stands in for the cursor: a tooltip beside it would cover the glass.
          tooltip={loupe.active ? null : tooltip}
          rightPanel={textOpen ? "min(600px, 100%)" : null}
          extra={
            <AnimatePresence>
              {textOpen && (
                <ReaderTextPanel
                  key="text"
                  hex={address.hex}
                  wall={address.wall}
                  shelf={address.shelf}
                  volume={address.volume}
                  pages={pages}
                  contents={contents}
                  query={query}
                  page={rightPage(spread)}
                  address={currentAddress}
                  fragment={fragments.mark}
                  live={fragments.live}
                  shareUrl={shareUrl}
                  scrollToken={fragmentFocus.spread === spread ? fragmentFocus.n : 0}
                  currentMatch={currentMatch}
                  matchScrollToken={matchCursor.key === matchKey ? matchCursor.step : 0}
                  onSelection={onSelection}
                  onShare={settleSelection}
                  onShow={showFragment}
                  onClear={clearFragment}
                  onClose={() => setTextOpen(false)}
                />
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
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                stepSearch(e.shiftKey ? -1 : 1);
              }}
              placeholder={t("findPlaceholder")}
              title={t("findTitle")}
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
            {query &&
              (matches.length ? (
                <Flex align="center" gap={1}>
                  <HudButton onClick={() => stepSearch(-1)} title={t("prevMatchTitle")}>
                    ↑
                  </HudButton>
                  <Text color="brand.200" fontSize="xs" fontFamily={mono} whiteSpace="nowrap" minW="4.5em" textAlign="center">
                    {t("matchOf", { current: matchIndex + 1, count: matches.length })}
                  </Text>
                  <HudButton onClick={() => stepSearch(1)} title={t("nextMatchTitle")}>
                    ↓
                  </HudButton>
                </Flex>
              ) : (
                <Text color="dark.200" fontSize="xs" fontFamily={mono} whiteSpace="nowrap">
                  {t("notOnSpread")}
                </Text>
              ))}
            <HudButton active={loupe.active} onClick={loupe.toggle} title={t("loupeTitle")}>
              {t("loupe")}
            </HudButton>
            <HudButton active={textOpen} onClick={() => setTextOpen((o) => !o)}>
              {t("textAndAddress")}
            </HudButton>
          </Flex>
        </ExploreHud>
      </ExploreStage>
    </PageTransition>
  );
}
