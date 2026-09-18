"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@chakra-ui/react";
import { useLocalizedPath, useRouter } from "@/i18n/navigation";
import ExploreHud, { HudLayer, HudSelector } from "@/components/explore/ExploreHud";
import type { BookRef } from "@/components/explore/Bookcase";
import type { WorldPlace } from "@/components/explore/HexGalleryScene";
import { DOOR_INDEX, sideYaw } from "@/components/explore/geometry";
import { mouseCaptureAvailable } from "@/components/explore/cursor";
import { useStageHandlers, useStageSelector, useStageStore, useStageView } from "@/components/explore/stage/StageProvider";
import type { StageView } from "@/components/explore/stage/stageStore";
import { generateRandomHex, shortHex } from "@/lib/hex";
import { LIBRARY, clampInt, isValidHex } from "@/lib/library";

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
      <HudLayer>
        <ExploreHud kicker={t("kicker")} title={common("wallN", { n: initialWall })} back={{ href: "/", label: explore("backHome") }} />
      </HudLayer>
    );
  }
  return <GalleryExplorer key="world" hex={hex} initialWall={initialWall} />;
}

/**
 * Mounted once per visit. `hex` follows the visitor (the address is rewritten as they cross into other galleries);
 * the stage keeps the world it built around the first one.
 */
function GalleryExplorer({ hex, initialWall }: { hex: string; initialWall: number }) {
  const t = useTranslations("Gallery");
  const explore = useTranslations("Explore");
  const common = useTranslations("Common");
  const router = useRouter();
  const localizedPath = useLocalizedPath();
  const store = useStageStore();

  const view = useMemo<StageView>(() => ({ kind: "walk", hex, wall: initialWall }), [hex, initialWall]);
  useStageView(view);

  // Back from a shelf or a book the world is still the one the visitor walked in: they may be floors away from its start.
  const [place, setPlace] = useState<WorldPlace>(() => {
    const known = store.getSnapshot().place;
    return known && known.hex === hex ? known : { level: 0, side: "a", hex };
  });
  const placeRef = useRef(place);
  const [facingWall, setFacingWall] = useState(initialWall);
  const lastWallRef = useRef(initialWall);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const ready = useStageSelector((s) => s.ready);
  const locked = useStageSelector((s) => s.locked);
  const moving = useStageSelector((s) => s.moving);
  const lockable = useSyncExternalStore(noSubscribe, mouseCaptureAvailable, () => false);
  // What was under the pointer when a flight started is not under it when the flight lands.
  const [flying, setFlying] = useState(moving);
  if (moving !== flying) {
    setFlying(moving);
    if (moving) setTooltip(null);
  }

  // Hide the hint a while after the scene is actually visible.
  useEffect(() => {
    if (!ready || !showHint) return;
    const timer = setTimeout(() => setShowHint(false), 16000);
    return () => clearTimeout(timer);
  }, [ready, showHint]);

  // The address of the gallery the visitor is in, read at call time: these callbacks are fired from
  // the render loop, before React has re-rendered with a new place.
  const hexQuery = () => `?hex=${encodeURIComponent(placeRef.current.hex)}`;

  const selectWall = useCallback(
    (w: number) => {
      store.commands.lookAt?.(sideYaw(w - 1), -0.04);
      setFacingWall(w);
      lastWallRef.current = w;
      window.history.replaceState(null, "", localizedPath(`/explore/wall/${w}${hexQuery()}`));
    },
    [store, localizedPath]
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

  // The mouse being taken is not a page matter: `locked` comes from the stage.
  useStageHandlers({ onHoverBook, onClickBook, onHoverShelf, onClickShelf, onFacingSide, onPlace, onInteract });

  const title = facingWall === 0 ? t("vestibule") : common("wallN", { n: facingWall });
  const kicker = place.level === 0 ? t("kicker") : t("kickerFloor", { floor: `${place.level > 0 ? "+" : ""}${place.level}` });

  return (
    <HudLayer>
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
        // Nothing is aimed at while a flight plays.
        reticle={locked && !moving ? (tooltip ? "active" : "idle") : null}
        tooltipAnchor={locked ? "center" : "pointer"}
        tooltip={moving ? null : tooltip}
        banner={banner}
      >
        <HudSelector label={common("wall")} items={WALLS} active={facingWall} onSelect={selectWall} />
      </ExploreHud>
    </HudLayer>
  );
}
