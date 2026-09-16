"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Box, Flex, Text } from "@chakra-ui/react";
import { AnimatePresence, motion } from "motion/react";
import BookPage from "@/components/BookPage";
import AddressDisplay from "@/components/AddressDisplay";
import LibraryNav from "@/components/LibraryNav";
import { fragmentFromSelection, type TextFragment } from "@/lib/fragment";
import { useFragmentColor } from "@/lib/fragmentColor";
import FragmentColorPicker from "./FragmentColorPicker";
import { HudButton, HudCopyButton } from "./ExploreHud";

const mono = "var(--font-jetbrains), monospace";
const serif = "var(--font-cormorant), Georgia, serif";
/** A selection being dragged is read back at most this often: every change redraws a page of the 3D book. */
const SELECTION_READ_MS = 60;

export interface ReaderTextPanelProps {
  hex: string;
  wall: number;
  shelf: number;
  volume: number;
  /** Pages of the open spread. */
  pages: number[];
  contents: Record<number, string>;
  query: string;
  /** Right page of the open spread. */
  page: number;
  /** Address of the open spread, shown under the text. */
  address: string;
  /** The marked fragment, drawn into the text. */
  fragment: TextFragment | null;
  /** The part of the text selected right now, if any. */
  live: TextFragment | null;
  /** Link to the fragment the bar at the bottom is about (the selection, or else the mark). */
  shareUrl: string;
  /** Whenever this changes to a new non-zero value, the marked fragment is scrolled into view. */
  scrollToken: number;
  /** The occurrence of the searched phrase the reader is at. */
  currentMatch: { page: number; start: number } | null;
  /** Whenever this changes to a new non-zero value, the current occurrence is scrolled into view. */
  matchScrollToken: number;
  onSelection: (selected: TextFragment | null) => void;
  onShare: () => void;
  onShow: () => void;
  onClear: () => void;
  onClose: () => void;
}

export default function ReaderTextPanel(props: ReaderTextPanelProps) {
  const { hex, wall, shelf, volume, pages, contents, query, page, address, fragment, live, shareUrl, scrollToken, currentMatch, matchScrollToken, onShare, onShow, onClear, onClose } = props;
  const t = useTranslations("Reader");
  const common = useTranslations("Common");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fragmentColor, setFragmentColor] = useFragmentColor();

  const onSelection = useRef(props.onSelection);
  useLayoutEffect(() => {
    onSelection.current = props.onSelection;
  });

  // The selection is read as page offsets while it is being made, so the 3D book can follow it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      timer = null;
      const root = scrollRef.current;
      onSelection.current(root ? fragmentFromSelection(root, document.getSelection()) : null);
    };
    const onChange = () => {
      timer ??= setTimeout(read, SELECTION_READ_MS);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (timer) clearTimeout(timer);
      // The text goes away with the panel, and the selection in it.
      onSelection.current(null);
    };
  }, []);

  // The text under a selection can be replaced (pages turned, their text arriving, a new search phrase). The browser
  // then collapses the selection without a selectionchange event, so while one is reported as live, it is read again
  // after every render: a selection that is gone ends, and its fragment becomes the mark.
  useLayoutEffect(() => {
    if (!live) return;
    const root = scrollRef.current;
    onSelection.current(root ? fragmentFromSelection(root, document.getSelection()) : null);
  });

  // Bring the marked fragment, or the occurrence stepped to, into view once it is on the page (its text may still be on its way).
  const scrolledFor = useRef({ fragment: 0, match: 0 });
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const bring = (selector: string) => {
      const mark = box.querySelector<HTMLElement>(selector);
      if (!mark) return false;
      const b = box.getBoundingClientRect();
      const m = mark.getBoundingClientRect();
      // A long fragment starts near the top; a short one sits in the middle.
      const offset = m.height > b.height * 0.6 ? 48 : (b.height - m.height) / 2;
      box.scrollTo({ top: box.scrollTop + m.top - b.top - offset, behavior: "smooth" });
      return true;
    };
    const done = scrolledFor.current;
    if (scrollToken && done.fragment !== scrollToken && bring("mark[data-fragment]")) done.fragment = scrollToken;
    if (matchScrollToken && done.match !== matchScrollToken && bring("mark[data-current]")) done.match = matchScrollToken;
  });

  const shown = live ?? fragment;
  const snippet = shown ? (contents[shown.page] ?? "").slice(shown.start, shown.end) : "";

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(600px, 100%)", zIndex: 8 }}
    >
      <Flex direction="column" h="100%" bg="rgba(7,6,10,0.94)" backdropFilter="blur(12px)" borderLeft="1px solid" borderColor="brand.300/25">
        <Box ref={scrollRef} flex="1" minH={0} overflowY="auto" overflowX="hidden" px={{ base: 4, md: 6 }} py={5}>
          <Flex justify="space-between" align="center" mb={2}>
            <Text color="dark.100" fontSize="10px" textTransform="uppercase" letterSpacing="0.25em" fontFamily={mono}>
              {t("spreadText")}
            </Text>
            <HudButton onClick={onClose}>{t("close")}</HudButton>
          </Flex>
          <Text color="dark.100" fontSize="sm" fontFamily={serif} fontStyle="italic" lineHeight="1.4" mb={3}>
            {t("selectHint")}
          </Text>
          <Box mb={5}>
            <LibraryNav wall={wall} shelf={shelf} volume={volume} page={page} addressHex={hex} />
          </Box>
          {pages.map((p) => (
            <Box key={p} mb={6}>
              <Flex justify="space-between" align="center" gap={2} mb={2}>
                <Text color="brand.200/80" fontSize="xs" fontFamily={mono} letterSpacing="0.1em">
                  {common("pageN", { n: p })}
                </Text>
                <HudCopyButton value={contents[p] ?? ""} label={t("copyText")} copiedLabel={t("copied")} title={t("copyTextTitle", { n: p })} />
              </Flex>
              <BookPage
                page={p}
                content={contents[p] ?? ""}
                highlight={query || undefined}
                current={currentMatch?.page === p ? currentMatch.start : null}
                fragmentColor={fragmentColor}
                mark={fragment?.page === p ? fragment : null}
                selecting={live !== null}
              />
            </Box>
          ))}
          <AddressDisplay address={address} />
        </Box>

        <AnimatePresence initial={false}>
          {shown && (
            <motion.div
              key="fragment"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              style={{ overflow: "hidden", flexShrink: 0 }}
            >
              <Flex align="center" gap={2} flexWrap="wrap" px={{ base: 4, md: 6 }} py={3} borderTop="1px solid" borderColor="brand.300/25" bg="rgba(12,9,12,0.96)">
                <Box flex={{ base: "1 1 100%", sm: "1 1 0" }} minW={0}>
                  <Flex align="center" gap={2}>
                    <FragmentColorPicker color={fragmentColor} onChange={setFragmentColor} />
                    <Text color="dark.100" fontSize="10px" textTransform="uppercase" letterSpacing="0.2em" fontFamily={mono} whiteSpace="nowrap">
                      {t("fragment")}
                    </Text>
                    <Text color="parchment.200" fontSize="xs" fontFamily={mono} whiteSpace="nowrap">
                      {t("fragmentInfo", { page: shown.page, count: shown.end - shown.start })}
                    </Text>
                  </Flex>
                  {snippet && (
                    <Text color="dark.50" fontSize="xs" fontFamily={mono} mt={1} whiteSpace="pre" overflow="hidden" textOverflow="ellipsis">
                      {snippet}
                    </Text>
                  )}
                </Box>
                <Flex gap={2} flexShrink={0} ml="auto">
                  <HudButton onClick={onShow} title={t("showFragmentTitle")}>
                    {t("showFragment")}
                  </HudButton>
                  <HudCopyButton key={shareUrl} value={shareUrl} label={t("shareFragment")} copiedLabel={t("linkCopied")} title={t("shareFragmentTitle")} onCopy={onShare} />
                  <HudButton onClick={onClear} title={t("clearFragment")}>
                    ✕
                  </HudButton>
                </Flex>
              </Flex>
            </motion.div>
          )}
        </AnimatePresence>
      </Flex>
    </motion.div>
  );
}
