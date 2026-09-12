"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import PageTransition from "@/components/PageTransition";
import ExploreHud, { ExploreStage } from "@/components/explore/ExploreHud";
import { generateRandomHex, hashString, shortHex } from "@/lib/hex";
import { LIBRARY, clampInt, isValidHex } from "@/lib/library";

const SceneWrapper = dynamic(() => import("@/components/explore/SceneWrapper"), { ssr: false });
const VolumeScene = dynamic(() => import("@/components/explore/VolumeScene"), { ssr: false });

const mono = "var(--font-jetbrains), monospace";

function Crumb({ href, children, current }: { href?: string; children: React.ReactNode; current?: boolean }) {
  const inner = (
    <Text
      color={current ? "brand.300" : "dark.50"}
      fontSize="xs"
      fontFamily={mono}
      px={3}
      py={1.5}
      borderRadius="4px"
      bg="rgba(7,6,10,0.55)"
      border="1px solid"
      borderColor={current ? "brand.300/50" : "dark.400/50"}
      backdropFilter="blur(6px)"
      transition="all 0.2s ease"
      _hover={href ? { color: "brand.200", borderColor: "brand.300/40" } : undefined}
    >
      {children}
    </Text>
  );
  return href ? (
    <NextLink href={href} style={{ textDecoration: "none" }}>
      {inner}
    </NextLink>
  ) : (
    inner
  );
}

export default function VolumeExplorePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const wall = clampInt(params.wall, 1, LIBRARY.walls);
  const shelf = clampInt(params.shelf, 1, LIBRARY.shelves);
  const volume = clampInt(params.volume, 1, LIBRARY.volumes);

  const hexParam = searchParams.get("hex");
  const hex = isValidHex(hexParam) ? hexParam : "";

  useEffect(() => {
    if (!hex) router.replace(`/explore/wall/${wall}/shelf/${shelf}/volume/${volume}?hex=${generateRandomHex()}`, { scroll: false });
  }, [hex, wall, shelf, volume, router]);

  const hexQuery = hex ? `?hex=${encodeURIComponent(hex)}` : "";
  const seed = useMemo(() => hashString(hex), [hex]);
  const [title, setTitle] = useState("");
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hex) return;
    const controller = new AbortController();
    fetch("/api/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: `${hex}-${wall}-${shelf}-${volume}-1` }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { title?: string }) => {
        if (typeof data.title === "string") setTitle(data.title);
      })
      .catch(() => {
        /* offline or aborted */
      });
    return () => controller.abort();
  }, [hex, wall, shelf, volume]);

  // Hide the hint a while after the scene is actually visible.
  useEffect(() => {
    if (!ready || !showHint) return;
    const t = setTimeout(() => setShowHint(false), 12000);
    return () => clearTimeout(t);
  }, [ready, showHint]);

  const onHoverPage = useCallback((page: number | null) => setTooltip(page ? `Страница ${page} — открыть` : null), []);
  const onClickPage = useCallback(
    (page: number) => {
      if (!hex) return;
      router.push(`/page/${encodeURIComponent(`${hex}-${wall}-${shelf}-${volume}-${page}`)}`);
    },
    [router, hex, wall, shelf, volume]
  );

  return (
    <PageTransition>
      <ExploreStage>
        {hex && (
          <SceneWrapper seed={seed} onReady={() => setReady(true)}>
          <VolumeScene
            title={title}
            wall={wall}
            shelf={shelf}
            volume={volume}
            onHoverPage={onHoverPage}
            onClickPage={onClickPage}
            onInteract={() => setShowHint(false)}
          />
          </SceneWrapper>
        )}

        <ExploreHud
          kicker="Открытый том"
          title={title.trim() ? `«${title.trim()}»` : `Том ${volume}`}
          galleryLabel={shortHex(hex)}
          back={{ href: `/explore/wall/${wall}/shelf/${shelf}${hexQuery}`, label: `полка ${shelf}` }}
          showHint={ready && showHint}
          hint={
            <>
              В томе {LIBRARY.pages} страница. Наведите на номер в указателе и нажмите, чтобы открыть страницу.
              <Box as="span" display={{ base: "none", md: "inline" }}> Тяните мышью, чтобы наклонить книгу, колесо приближает.</Box>
            </>
          }
          tooltip={tooltip}
        >
          <Flex align="center" gap={2} flexWrap="wrap" justify="center">
            <Crumb href={`/explore/wall/${wall}${hexQuery}`}>Стена {wall}</Crumb>
            <Text color="dark.300" fontSize="xs">
              →
            </Text>
            <Crumb href={`/explore/wall/${wall}/shelf/${shelf}${hexQuery}`}>Полка {shelf}</Crumb>
            <Text color="dark.300" fontSize="xs">
              →
            </Text>
            <Crumb current>Том {volume}</Crumb>
            <Box w="1px" h="20px" bg="dark.400/50" mx={1} display={{ base: "none", sm: "block" }} />
            <Box
              as="button"
              display={{ base: "none", sm: "block" }}
              onClick={() => onClickPage(1 + Math.floor(Math.random() * LIBRARY.pages))}
              px={3}
              py={1.5}
              borderRadius="4px"
              bg="rgba(7,6,10,0.55)"
              border="1px solid"
              borderColor="dark.400/50"
              color="dark.50"
              fontSize="xs"
              fontFamily={mono}
              cursor="pointer"
              backdropFilter="blur(6px)"
              transition="all 0.2s ease"
              _hover={{ color: "brand.200", borderColor: "brand.300/40" }}
            >
              ✦ случайная страница
            </Box>
          </Flex>
        </ExploreHud>
      </ExploreStage>
    </PageTransition>
  );
}
