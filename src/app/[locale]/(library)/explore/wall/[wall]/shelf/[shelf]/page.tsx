"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box } from "@chakra-ui/react";
import { useRouter } from "@/i18n/navigation";
import ExploreHud, { HudLayer, HudSelector } from "@/components/explore/ExploreHud";
import type { BookRef } from "@/components/explore/Bookcase";
import { useStageHandlers, useStageSelector, useStageStore, useStageView } from "@/components/explore/stage/StageProvider";
import type { StageView } from "@/components/explore/stage/stageStore";
import { generateRandomHex, shortHex } from "@/lib/hex";
import { LIBRARY, clampInt, isValidHex } from "@/lib/library";

const SHELVES = Array.from({ length: LIBRARY.shelves }, (_, i) => i + 1);

export default function ShelfExplorePage() {
  const t = useTranslations("Shelf");
  const explore = useTranslations("Explore");
  const common = useTranslations("Common");
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useStageStore();
  const wall = clampInt(params.wall, 1, LIBRARY.walls);
  const shelf = clampInt(params.shelf, 1, LIBRARY.shelves);

  const hexParam = searchParams.get("hex");
  const hex = isValidHex(hexParam) ? hexParam : "";

  useEffect(() => {
    if (!hex) router.replace(`/explore/wall/${wall}/shelf/${shelf}?hex=${generateRandomHex()}`, { scroll: false });
  }, [hex, wall, shelf, router]);

  const hexQuery = hex ? `?hex=${encodeURIComponent(hex)}` : "";
  const view = useMemo<StageView | null>(() => (hex ? { kind: "shelf", hex, wall, shelf } : null), [hex, wall, shelf]);
  useStageView(view);

  // The titles and the shelf they were fetched for: another shelf's must never be shown or published as this one's.
  const [fetched, setFetched] = useState<{ hex: string; wall: number; shelf: number; titles: string[] } | null>(null);
  const titles = fetched && fetched.hex === hex && fetched.wall === wall && fetched.shelf === shelf ? fetched.titles : null;
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const ready = useStageSelector((s) => s.ready);

  // Titles of the 31 volumes on this shelf (the gallery address decides them).
  useEffect(() => {
    if (!hex) return;
    const controller = new AbortController();
    fetch("/api/titles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hex, wall, shelf, lang: locale }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { titles?: string[] }) => {
        if (Array.isArray(data.titles) && data.titles.length === LIBRARY.volumes) setFetched({ hex, wall, shelf, titles: data.titles });
      })
      .catch(() => {
        /* aborted or offline — spines stay blank */
      });
    return () => controller.abort();
  }, [hex, wall, shelf, locale]);

  // The spines on the stage carry the titles. Only real ones are published: the stage already shows blank spines for a
  // shelf without titles, and may still hold this shelf's from a moment ago (back from a book), which blanks would wipe.
  useEffect(() => {
    if (titles) store.setShelfTitles({ hex, wall, shelf, titles });
  }, [store, hex, wall, shelf, titles]);

  // Hide the hint a while after the scene is actually visible.
  useEffect(() => {
    if (!ready || !showHint) return;
    const timer = setTimeout(() => setShowHint(false), 12000);
    return () => clearTimeout(timer);
  }, [ready, showHint]);

  const titlesRef = useRef(titles);
  useEffect(() => {
    titlesRef.current = titles;
  }, [titles]);

  const onHoverBook = useCallback(
    (b: BookRef | null) => {
      if (!b) {
        setTooltip(null);
        return;
      }
      const title = b.wall === wall && b.shelf === shelf ? titlesRef.current?.[b.volume - 1]?.trim() : "";
      setTooltip(title ? t("tooltipTitled", { volume: b.volume, title }) : t("tooltipVolume", { volume: b.volume }));
    },
    [wall, shelf, t]
  );
  const onClickBook = useCallback(
    (b: BookRef) => router.push(`/explore/wall/${b.wall}/shelf/${b.shelf}/volume/${b.volume}${hexQuery}`),
    [router, hexQuery]
  );
  const onHoverShelf = useCallback(
    (w: number, s: number | null) => setTooltip(s ? (s === shelf && w === wall ? t("tooltipHere", { shelf: s }) : t("tooltipGo", { wall: w, shelf: s })) : null),
    [wall, shelf, t]
  );
  const onClickShelf = useCallback(
    (w: number, s: number) => {
      if (w === wall && s === shelf) return;
      router.push(`/explore/wall/${w}/shelf/${s}${hexQuery}`);
    },
    [router, hexQuery, wall, shelf]
  );

  useStageHandlers({ onHoverBook, onClickBook, onHoverShelf, onClickShelf, onInteract: () => setShowHint(false) });

  return (
    <HudLayer>
      <ExploreHud
        kicker={t("kicker")}
        title={common("wallShelf", { wall, shelf })}
        galleryLabel={shortHex(hex)}
        back={{ href: `/explore/wall/${wall}${hexQuery}`, label: explore("backWall", { n: wall }) }}
        showHint={ready && showHint}
        hint={
          <>
            {t("hint", { volumes: LIBRARY.volumes })}
            <Box as="span" display={{ base: "none", md: "inline" }}>{t("hintDesktop")}</Box>
          </>
        }
        tooltip={tooltip}
      >
        <HudSelector label={common("shelf")} items={SHELVES} active={shelf} hrefFor={(s) => `/explore/wall/${wall}/shelf/${s}${hexQuery}`} />
      </ExploreHud>
    </HudLayer>
  );
}
