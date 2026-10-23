"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@chakra-ui/react";
import { useLocalizedPath, useRouter } from "@/i18n/navigation";
import ExploreHud, { HudLayer, HudSelector, HudButton } from "@/components/explore/ExploreHud";
import type { BookRef } from "@/components/explore/Bookcase";
import type { WorldPlace } from "@/components/explore/HexGalleryScene";
import { sideWall, sideYaw, wallSide } from "@/components/explore/geometry";
import { mouseCaptureAvailable } from "@/components/explore/cursor";
import { useStageHandlers, useStageSelector, useStageStore, useStageView } from "@/components/explore/stage/StageProvider";
import type { StageView } from "@/components/explore/stage/stageStore";
import { cellOf, CENTRE, addressOf, formatCoordinate } from "@/lib/world";
import { useOnlineStore, useOnlineSelector } from "@/components/online/OnlineProvider";
import { restoreSpawn } from "@/components/online/spawn";
import GalleryNotes from "@/components/online/GalleryNotes";
import NoteComposer from "@/components/online/NoteComposer";
import { shortHex } from "@/lib/hex";
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
  const online = useOnlineStore();

  // A gallery without an address gets one, client-side only, so server and client markup agree.
  useEffect(() => {
    if (hex) return;
    return restoreSpawn(online, initialWall, (target, wall) => router.replace(`/explore/wall/${wall}?hex=${target}`, { scroll: false }));
  }, [hex, initialWall, router, online]);

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
  const notes = useTranslations("Notes");
  const online = useOnlineSelector((s) => s.status === "online");
  const [composing, setComposing] = useState(false);
  const router = useRouter();
  const localizedPath = useLocalizedPath();
  const store = useStageStore();

  const view = useMemo<StageView>(() => ({ kind: "walk", hex, wall: initialWall }), [hex, initialWall]);
  useStageView(view);

  // Back from a shelf or a book the world is still the one the visitor walked in: they may be floors away from its start.
  const [initialPlace] = useState<WorldPlace>(() => {
    const known = store.getSnapshot().place;
    return known && known.hex === hex ? known : { level: 0, col: 0, hex, cell: cellOf(hex) };
  });
  const place = useStageSelector((s) => s.place) ?? initialPlace;
  const placeRef = useRef(place);
  useLayoutEffect(() => { placeRef.current = place; }, [place]);
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
  const hexQuery = useCallback(() => `?hex=${encodeURIComponent((store.getSnapshot().place ?? initialPlace).hex)}`, [store, initialPlace]);

  const selectWall = useCallback(
    (w: number) => {
      store.commands.lookAt?.(sideYaw(wallSide(w)), -0.04);
      setFacingWall(w);
      lastWallRef.current = w;
      window.history.replaceState(null, "", localizedPath(`/explore/wall/${w}${hexQuery()}`));
    },
    [store, localizedPath, hexQuery]
  );

  const onFacingSide = useCallback(
    (side: number) => {
      const w = sideWall(side);
      setFacingWall(w);
      if (!w) return;
      lastWallRef.current = w;
      window.history.replaceState(null, "", localizedPath(`/explore/wall/${w}${hexQuery()}`));
    },
    [localizedPath, hexQuery]
  );

  const onPlace = useCallback(
    (next: WorldPlace) => {
      const prev = placeRef.current;
      placeRef.current = next;
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
  const onClickBook = useCallback((b: BookRef) => router.push(`/explore/wall/${b.wall}/shelf/${b.shelf}/volume/${b.volume}${hexQuery()}`), [router, hexQuery]);
  const onClickShelf = useCallback((wall: number, shelf: number) => router.push(`/explore/wall/${wall}/shelf/${shelf}${hexQuery()}`), [router, hexQuery]);
  const onInteract = useCallback(() => setShowHint(false), []);

  // The mouse being taken is not a page matter: `locked` comes from the stage.
  useStageHandlers({ onHoverBook, onClickBook, onHoverShelf, onClickShelf, onFacingSide, onPlace, onInteract });

  const title = facingWall === 0 ? t("vestibule") : common("wallN", { n: facingWall });
  const kicker = t("kickerCell", { x: formatCoordinate(place.cell.x), floor: formatCoordinate(place.cell.floor) });

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
        extra={online && (
          <Box position="absolute" left={{ base: 3, md: 6 }} top="100px" pointerEvents="auto">
            {composing ? <NoteComposer cell={place.cell} anchor={null} onDone={() => setComposing(false)} /> : <GalleryNotes cell={place.cell} />}
          </Box>
        )}
      >
        <HudSelector label={common("wall")} items={WALLS} active={facingWall} onSelect={selectWall} />
        <HudButton onClick={() => router.push(`/explore/wall/1?hex=${addressOf(CENTRE)}`)} title={t("toCentreTitle")}>
          {t("toCentre")}
        </HudButton>
        {online && <HudButton onClick={() => { store.commands.release?.(); setComposing(true); }} title={notes("hereTitle")}>{notes("here")}</HudButton>}
      </ExploreHud>
    </HudLayer>
  );
}
