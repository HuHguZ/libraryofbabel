"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Box } from "@chakra-ui/react";
import PageTransition from "@/components/PageTransition";
import ExploreHud, { ExploreStage, HudSelector } from "@/components/explore/ExploreHud";
import type { GalleryControlsHandle } from "@/components/explore/GalleryControls";
import type { BookRef } from "@/components/explore/Bookcase";
import type { WorldPlace } from "@/components/explore/HexGalleryScene";
import { DOOR_INDEX, sideYaw } from "@/components/explore/geometry";
import { mouseCaptureAvailable } from "@/components/explore/cursor";
import { generateRandomHex, hashString, shortHex } from "@/lib/hex";
import { LIBRARY, clampInt, isValidHex } from "@/lib/library";

const SceneWrapper = dynamic(() => import("@/components/explore/SceneWrapper"), { ssr: false });
const HexGalleryScene = dynamic(() => import("@/components/explore/HexGalleryScene"), { ssr: false });

const WALLS = Array.from({ length: LIBRARY.walls }, (_, i) => i + 1);
const noSubscribe = () => () => {};

export default function WallExplorePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initialWall] = useState(() => clampInt(params.wall, 1, LIBRARY.walls));

  const hexParam = searchParams.get("hex");
  const hex = isValidHex(hexParam) ? hexParam : "";

  // A gallery without an address gets one, client-side only, so server and client markup agree.
  useEffect(() => {
    if (!hex) router.replace(`/explore/wall/${initialWall}?hex=${generateRandomHex()}`, { scroll: false });
  }, [hex, initialWall, router]);

  if (!hex) {
    return (
      <PageTransition>
        <ExploreStage>
          <ExploreHud kicker="Шестигранная галерея" title={`Стена ${initialWall}`} back={{ href: "/", label: "на главную" }} />
        </ExploreStage>
      </PageTransition>
    );
  }
  return <GalleryExplorer key="world" startHex={hex} initialWall={initialWall} />;
}

/** Mounted once per visit: the world grows around the first address and never re-seeds while walking. */
function GalleryExplorer({ startHex, initialWall }: { startHex: string; initialWall: number }) {
  const router = useRouter();
  const [worldHex] = useState(startHex);
  const worldSeed = useMemo(() => hashString(worldHex), [worldHex]);
  const controlsRef = useRef<GalleryControlsHandle>(null);

  const [place, setPlace] = useState<WorldPlace>({ level: 0, side: "a", hex: worldHex });
  const placeRef = useRef(place);
  const [facingWall, setFacingWall] = useState(initialWall);
  const lastWallRef = useRef(initialWall);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const lockable = useSyncExternalStore(noSubscribe, mouseCaptureAvailable, () => false);

  // Hide the hint a while after the scene is actually visible.
  useEffect(() => {
    if (!ready || !showHint) return;
    const t = setTimeout(() => setShowHint(false), 16000);
    return () => clearTimeout(t);
  }, [ready, showHint]);

  // Development aid: lets the console move the visitor (window.__gallery.current.teleport(...)).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __gallery?: unknown }).__gallery = controlsRef;
  }, []);

  // The address of the gallery the visitor is in, read at call time: these callbacks are fired from
  // the render loop, before React has re-rendered with a new place.
  const hexQuery = () => `?hex=${encodeURIComponent(placeRef.current.hex)}`;

  const selectWall = useCallback((w: number) => {
    controlsRef.current?.lookAt(sideYaw(w - 1), -0.04);
    setFacingWall(w);
    lastWallRef.current = w;
    window.history.replaceState(null, "", `/explore/wall/${w}${hexQuery()}`);
  }, []);

  const onFacingSide = useCallback((side: number) => {
    if (side === DOOR_INDEX) {
      setFacingWall(0);
      return;
    }
    const w = side + 1;
    setFacingWall(w);
    lastWallRef.current = w;
    window.history.replaceState(null, "", `/explore/wall/${w}${hexQuery()}`);
  }, []);

  const onPlace = useCallback((next: WorldPlace) => {
    const prev = placeRef.current;
    placeRef.current = next;
    setPlace(next);
    setBanner(
      next.level > prev.level
        ? "Вы поднялись в галерею этажом выше. Лестница ведёт дальше вверх."
        : next.level < prev.level
          ? "Вы спустились в галерею этажом ниже. Лестница уходит дальше вниз."
          : "Вы вошли в соседнюю галерею. Здесь те же полки и другие книги."
    );
    window.history.replaceState(null, "", `/explore/wall/${lastWallRef.current}?hex=${next.hex}`);
  }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3400);
    return () => clearTimeout(t);
  }, [banner]);

  const onHoverBook = useCallback((b: BookRef | null) => {
    setTooltip(b ? `Стена ${b.wall} · Полка ${b.shelf} · Том ${b.volume}` : null);
  }, []);
  const onHoverShelf = useCallback((wall: number, shelf: number | null) => {
    setTooltip(shelf ? `Стена ${wall} · Полка ${shelf} — открыть полку` : null);
  }, []);
  const onClickBook = useCallback((b: BookRef) => router.push(`/explore/wall/${b.wall}/shelf/${b.shelf}/volume/${b.volume}${hexQuery()}`), [router]);
  const onClickShelf = useCallback((wall: number, shelf: number) => router.push(`/explore/wall/${wall}/shelf/${shelf}${hexQuery()}`), [router]);
  const onInteract = useCallback(() => setShowHint(false), []);

  const title = facingWall === 0 ? "Вестибюль" : `Стена ${facingWall}`;
  const kicker = place.level === 0 ? "Шестигранная галерея" : `Шестигранная галерея · этаж ${place.level > 0 ? "+" : ""}${place.level}`;

  return (
    <PageTransition>
      <ExploreStage>
        <SceneWrapper seed={worldSeed} onReady={() => setReady(true)}>
          <HexGalleryScene
            mode="walk"
            worldHex={worldHex}
            wall={initialWall}
            controlsRef={controlsRef}
            onHoverBook={onHoverBook}
            onClickBook={onClickBook}
            onHoverShelf={onHoverShelf}
            onClickShelf={onClickShelf}
            onFacingSide={onFacingSide}
            onPlace={onPlace}
            onInteract={onInteract}
            onLockChange={setLocked}
          />
        </SceneWrapper>

        <ExploreHud
          kicker={kicker}
          title={title}
          galleryLabel={shortHex(place.hex)}
          back={{ href: "/", label: "на главную" }}
          showHint={ready && showHint}
          hint={
            <>
              <Box as="span" display={{ base: "none", md: "inline" }}>
                W A S D — идти, Shift — бежать, пробел — прыгнуть, колесо — приблизить. Нажмите на том или на полку.
                Винтовая лестница в вестибюле ведёт в галереи выше и ниже, дальняя дверь — в соседнюю.
              </Box>
              <Box as="span" display={{ base: "inline", md: "none" }}>
                Ведите пальцем, чтобы осмотреться; двумя пальцами — идти. Коснитесь тома или полки.
              </Box>
            </>
          }
          lockHint={
            lockable && ready
              ? locked
                ? "Мышь ведёт взгляд · клик открывает то, что под прицелом · Esc отпускает курсор"
                : "Нажмите на сцену — управление мышью, как в игре · Esc отпускает курсор"
              : null
          }
          reticle={locked ? (tooltip ? "active" : "idle") : null}
          tooltipAnchor={locked ? "center" : "pointer"}
          tooltip={tooltip}
          banner={banner}
        >
          <HudSelector label="Стена" items={WALLS} active={facingWall} onSelect={selectWall} />
        </ExploreHud>
      </ExploreStage>
    </PageTransition>
  );
}
