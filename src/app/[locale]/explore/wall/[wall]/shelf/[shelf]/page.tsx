"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { Box } from "@chakra-ui/react";
import { useRouter } from "@/i18n/navigation";
import PageTransition from "@/components/PageTransition";
import ExploreHud, { ExploreStage, HudSelector } from "@/components/explore/ExploreHud";
import type { BookRef } from "@/components/explore/Bookcase";
import { generateRandomHex, hashString, shortHex } from "@/lib/hex";
import { LIBRARY, clampInt, isValidHex } from "@/lib/library";

const SceneWrapper = dynamic(() => import("@/components/explore/SceneWrapper"), { ssr: false });
const HexGalleryScene = dynamic(() => import("@/components/explore/HexGalleryScene"), { ssr: false });

const SHELVES = Array.from({ length: LIBRARY.shelves }, (_, i) => i + 1);
const EMPTY_TITLES = Array.from({ length: LIBRARY.volumes }, () => "");

export default function ShelfExplorePage() {
  const t = useTranslations("Shelf");
  const explore = useTranslations("Explore");
  const common = useTranslations("Common");
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const wall = clampInt(params.wall, 1, LIBRARY.walls);
  const shelf = clampInt(params.shelf, 1, LIBRARY.shelves);

  const hexParam = searchParams.get("hex");
  const hex = isValidHex(hexParam) ? hexParam : "";

  useEffect(() => {
    if (!hex) router.replace(`/explore/wall/${wall}/shelf/${shelf}?hex=${generateRandomHex()}`, { scroll: false });
  }, [hex, wall, shelf, router]);

  const seed = useMemo(() => hashString(hex), [hex]);
  const hexQuery = hex ? `?hex=${encodeURIComponent(hex)}` : "";

  const [titles, setTitles] = useState<string[]>(EMPTY_TITLES);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [ready, setReady] = useState(false);

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
        if (Array.isArray(data.titles) && data.titles.length === LIBRARY.volumes) setTitles(data.titles);
      })
      .catch(() => {
        /* aborted or offline — spines stay blank */
      });
    return () => controller.abort();
  }, [hex, wall, shelf, locale]);

  // Hide the hint a while after the scene is actually visible.
  useEffect(() => {
    if (!ready || !showHint) return;
    const timer = setTimeout(() => setShowHint(false), 12000);
    return () => clearTimeout(timer);
  }, [ready, showHint]);

  const detail = useMemo(() => ({ shelf, titles }), [shelf, titles]);
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
      const title = b.wall === wall && b.shelf === shelf ? titlesRef.current[b.volume - 1]?.trim() : "";
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

  return (
    <PageTransition>
      <ExploreStage>
        {hex && (
          <SceneWrapper seed={seed} onReady={() => setReady(true)}>
            <HexGalleryScene
              key={`${wall}-${shelf}`}
              seed={seed}
              wall={wall}
              mode="shelf"
              detail={detail}
              onHoverBook={onHoverBook}
              onClickBook={onClickBook}
              onHoverShelf={onHoverShelf}
              onClickShelf={onClickShelf}
              onInteract={() => setShowHint(false)}
            />
          </SceneWrapper>
        )}

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
      </ExploreStage>
    </PageTransition>
  );
}
