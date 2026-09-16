"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Box } from "@chakra-ui/react";
import { useLocalizedPath, useRouter } from "@/i18n/navigation";
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
  const t = useTranslations("Gallery");
  const explore = useTranslations("Explore");
  const common = useTranslations("Common");
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
          <ExploreHud kicker={t("kicker")} title={common("wallN", { n: initialWall })} back={{ href: "/", label: explore("backHome") }} />
        </ExploreStage>
      </PageTransition>
    );
  }
  return <GalleryExplorer key="world" startHex={hex} initialWall={initialWall} />;
}

/** Mounted once per visit: the world grows around the first address and never re-seeds while walking. */
function GalleryExplorer({ startHex, initialWall }: { startHex: string; initialWall: number }) {
  const t = useTranslations("Gallery");
  const explore = useTranslations("Explore");
  const common = useTranslations("Common");
  const router = useRouter();
  const localizedPath = useLocalizedPath();
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
    const timer = setTimeout(() => setShowHint(false), 16000);
    return () => clearTimeout(timer);
  }, [ready, showHint]);

  // Development aid: lets the console move the visitor (window.__gallery.current.teleport(...)).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __gallery?: unknown }).__gallery = controlsRef;
  }, []);

  // The address of the gallery the visitor is in, read at call time: these callbacks are fired from
  // the render loop, before React has re-rendered with a new place.
  const hexQuery = () => `?hex=${encodeURIComponent(placeRef.current.hex)}`;

  const selectWall = useCallback(
    (w: number) => {
      controlsRef.current?.lookAt(sideYaw(w - 1), -0.04);
      setFacingWall(w);
      lastWallRef.current = w;
      window.history.replaceState(null, "", localizedPath(`/explore/wall/${w}${hexQuery()}`));
    },
    [localizedPath]
  );

  const onFacingSide = useCallback(
    (side: number) => {
      if (side === DOOR_INDEX) {
        setFacingWall(0);
        return;
      }
      const w = side + 1;
      setFacingWall(w);
      lastWallRef.current = w;
      window.history.replaceState(null, "", localizedPath(`/explore/wall/${w}${hexQuery()}`));
    },
    [localizedPath]
  );

  const onPlace = useCallback(
    (next: WorldPlace) => {
      const prev = placeRef.current;
      placeRef.current = next;
      setPlace(next);
      setBanner(next.level > prev.level ? t("bannerUp") : next.level < prev.level ? t("bannerDown") : t("bannerNext"));
      window.history.replaceState(null, "", localizedPath(`/explore/wall/${lastWallRef.current}?hex=${next.hex}`));
    },
    [t, localizedPath]
  );

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 3400);
    return () => clearTimeout(timer);
  }, [banner]);

  const onHoverBook = useCallback(
    (b: BookRef | null) => {
      setTooltip(b ? t("tooltipBook", { wall: b.wall, shelf: b.shelf, volume: b.volume }) : null);
    },
    [t]
  );
  const onHoverShelf = useCallback(
    (wall: number, shelf: number | null) => {
      setTooltip(shelf ? t("tooltipShelf", { wall, shelf }) : null);
    },
    [t]
  );
  const onClickBook = useCallback((b: BookRef) => router.push(`/explore/wall/${b.wall}/shelf/${b.shelf}/volume/${b.volume}${hexQuery()}`), [router]);
  const onClickShelf = useCallback((wall: number, shelf: number) => router.push(`/explore/wall/${wall}/shelf/${shelf}${hexQuery()}`), [router]);
  const onInteract = useCallback(() => setShowHint(false), []);

  const title = facingWall === 0 ? t("vestibule") : common("wallN", { n: facingWall });
  const kicker = place.level === 0 ? t("kicker") : t("kickerFloor", { floor: `${place.level > 0 ? "+" : ""}${place.level}` });

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
          back={{ href: "/", label: explore("backHome") }}
          showHint={ready && showHint}
          hint={
            <>
              <Box as="span" display={{ base: "none", md: "inline" }}>
                {t("hintDesktop")}
              </Box>
              <Box as="span" display={{ base: "inline", md: "none" }}>
                {t("hintTouch")}
              </Box>
            </>
          }
          lockHint={
            lockable && ready
              ? locked
                ? t("lockOn")
                : t("lockOff")
              : null
          }
          reticle={locked ? (tooltip ? "active" : "idle") : null}
          tooltipAnchor={locked ? "center" : "pointer"}
          tooltip={tooltip}
          banner={banner}
        >
          <HudSelector label={common("wall")} items={WALLS} active={facingWall} onSelect={selectWall} />
        </ExploreHud>
      </ExploreStage>
    </PageTransition>
  );
}
