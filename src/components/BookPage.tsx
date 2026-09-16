"use client";

import { useMemo } from "react";
import { Box } from "@chakra-ui/react";
import { findMatches } from "@/lib/alphabet";
import { DEFAULT_FRAGMENT_COLOR, FRAGMENT_ALPHA, fragmentWash } from "@/lib/fragmentColor";

const MATCH_WASH = "rgba(201, 168, 76, 0.35)";
/** The occurrence the reader is at; the 3D book draws it in the same colour. */
const CURRENT_WASH = "rgba(232, 118, 22, 0.55)";
const INK = "#2a1f0e";

interface BookPageProps {
  content: string;
  /** Phrase to highlight, already in the Library's alphabet. */
  highlight?: string;
  /** Fragment to mark: character offsets into `content`, the end exclusive. */
  mark?: { start: number; end: number } | null;
  /**
   * A new selection is being made over the text: the old mark steps back. Only an attribute changes,
   * so the text nodes (and the selection in them) stay untouched.
   */
  selecting?: boolean;
  /** Page number, so a selection in the text can be traced back to its page. */
  page?: number;
  /** Start of the occurrence of the phrase the reader is at, if it is on this page. */
  current?: number | null;
  /** The reader's fragment colour ("#rrggbb"): the mark and the selection are washed in it; the 3D book uses it too. */
  fragmentColor?: string;
}

interface Segment {
  text: string;
  match: boolean;
  current: boolean;
  mark: boolean;
}

/** Cuts the text wherever a search match or the mark begins or ends. */
export function segmentText(content: string, query: string, mark: BookPageProps["mark"], current: number | null = null): Segment[] {
  const matches = findMatches(content, query);
  const cuts = new Set([0, content.length]);
  for (const s of matches) {
    cuts.add(s);
    cuts.add(Math.min(content.length, s + query.length));
  }
  const from = mark ? Math.max(0, Math.min(content.length, mark.start)) : 0;
  const to = mark ? Math.max(from, Math.min(content.length, mark.end)) : 0;
  if (to > from) {
    cuts.add(from);
    cuts.add(to);
  }
  const bounds = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  let m = 0;
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i];
    while (m < matches.length && matches[m] + query.length <= a) m++;
    const match = m < matches.length && matches[m] <= a;
    const isCurrent = match && matches[m] === current;
    const marked = a >= from && a < to;
    const last = out[out.length - 1];
    const text = content.slice(a, bounds[i + 1]);
    if (last && last.match === match && last.current === isCurrent && last.mark === marked) last.text += text;
    else out.push({ text, match, current: isCurrent, mark: marked });
  }
  return out;
}

export default function BookPage({ content, highlight, mark, selecting, page, current = null, fragmentColor = DEFAULT_FRAGMENT_COLOR }: BookPageProps) {
  const segments = useMemo(() => segmentText(content, highlight ?? "", mark, current), [content, highlight, mark, current]);
  const tint = { wash: fragmentWash(fragmentColor, FRAGMENT_ALPHA.panel), selection: fragmentWash(fragmentColor, FRAGMENT_ALPHA.selection) };
  return (
    <Box position="relative" maxW="900px" mx="auto">
      {/* Outer glow */}
      <Box
        position="absolute"
        inset="-1px"
        borderRadius="6px"
        bg="transparent"
        boxShadow="0 0 40px rgba(201, 168, 76, 0.06), 0 8px 32px rgba(0, 0, 0, 0.4)"
        pointerEvents="none"
      />

      <Box
        bg="linear-gradient(170deg, #f5ebd4 0%, #ede0c0 30%, #e8d8b4 70%, #e0ceaa 100%)"
        border="1px solid"
        borderColor="brand.200/40"
        borderRadius="6px"
        boxShadow="inset 0 0 80px rgba(139, 109, 56, 0.06), inset 2px 2px 4px rgba(255, 255, 255, 0.1)"
        p={{ base: 5, md: 8 }}
        position="relative"
        overflow="hidden"
        _before={{
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(139, 109, 56, 0.04) 28px, rgba(139, 109, 56, 0.04) 29px)",
          pointerEvents: "none",
        }}
        _after={{
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          width: "40px",
          height: "100%",
          background: "linear-gradient(90deg, rgba(139, 109, 56, 0.04), transparent)",
          pointerEvents: "none",
        }}
      >
        {/* Corner decorations */}
        <Box
          position="absolute"
          top="12px"
          left="12px"
          w="16px"
          h="16px"
          borderTop="1px solid"
          borderLeft="1px solid"
          borderColor="brand.600/25"
          pointerEvents="none"
        />
        <Box
          position="absolute"
          top="12px"
          right="12px"
          w="16px"
          h="16px"
          borderTop="1px solid"
          borderRight="1px solid"
          borderColor="brand.600/25"
          pointerEvents="none"
        />
        <Box
          position="absolute"
          bottom="12px"
          left="12px"
          w="16px"
          h="16px"
          borderBottom="1px solid"
          borderLeft="1px solid"
          borderColor="brand.600/25"
          pointerEvents="none"
        />
        <Box
          position="absolute"
          bottom="12px"
          right="12px"
          w="16px"
          h="16px"
          borderBottom="1px solid"
          borderRight="1px solid"
          borderColor="brand.600/25"
          pointerEvents="none"
        />

        <Box
          // PAGE_TEXT_ATTR: a selection is traced back to its page by this attribute.
          data-page-text={page}
          data-selecting={selecting || undefined}
          fontFamily="var(--font-jetbrains), 'Courier New', monospace"
          fontSize={{ base: "11px", md: "13px" }}
          lineHeight="29px"
          color="#3a2e1a"
          whiteSpace="pre-wrap"
          wordBreak="break-all"
          position="relative"
          zIndex={1}
          letterSpacing="0.01em"
          fontWeight="400"
          // The pages are meant to be copied, even on the 3D stage, which turns selection off for everything else.
          userSelect="text"
          cursor="text"
          css={{
            "&::selection": { bg: tint.selection, color: INK },
            "& *::selection": { bg: tint.selection, color: INK },
            // A found sentence can be longer than a line; the marks wrap with the text.
            "& mark": { bg: "transparent", color: "inherit", whiteSpace: "pre-wrap" },
            "& mark[data-match]": { bg: MATCH_WASH, color: INK, px: "2px", borderRadius: "2px", boxShadow: "0 0 4px rgba(201, 168, 76, 0.2)" },
            "& mark[data-fragment]": { bg: tint.wash, color: INK },
            // Where a search match falls inside the fragment, both washes show, one over the other.
            "& mark[data-match][data-fragment]": { background: `linear-gradient(${MATCH_WASH}, ${MATCH_WASH}), ${tint.wash}` },
            "& mark[data-current]": { bg: CURRENT_WASH },
            "& mark[data-current][data-fragment]": { background: `linear-gradient(${CURRENT_WASH}, ${CURRENT_WASH}), ${tint.wash}` },
            "&[data-selecting] mark[data-fragment]": { bg: "transparent", boxShadow: "none" },
            "&[data-selecting] mark[data-match][data-fragment]": { bg: MATCH_WASH },
          }}
        >
          {segments.map((s, i) =>
            s.match || s.mark ? (
              <mark key={i} data-match={s.match || undefined} data-current={s.current || undefined} data-fragment={s.mark || undefined}>
                {s.text}
              </mark>
            ) : (
              s.text
            )
          )}
        </Box>
      </Box>
    </Box>
  );
}
