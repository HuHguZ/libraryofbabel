"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Flex, Input, Text, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { galleryCenter } from "@/components/explore/geometry";
import { useStageStore } from "@/components/explore/stage/StageProvider";
import type { StageStore } from "@/components/explore/stage/stageStore";
import { hasBit } from "@/lib/online/fog";
import type { Note } from "@/lib/online/protocol";
import { CENTRE, bitCell, chunkKeyOf, cellBit, formatCoordinate, parseCellKey, sameCell, type Cell } from "@/lib/world";
import { useOnlineStore } from "./OnlineProvider";
import type { OnlineStore } from "./onlineStore";
import { FLOOR_RATIO, cellAtPoint, pan, pointOf, viewAround, visibleChunks, zoomAt, type MapView } from "./mapView";
import { GROUP_RADIUS, alongOf, currentReaders, groupReaders, pickReaderGroup, type MapReader, type ReaderGroup } from "./map";
import { noteHref, placeHref, viewHref } from "./teleport";

const COLOURS = { fog: "#08070b", explored: "#3a2f1d", grid: "rgba(201, 168, 76, 0.09)", centre: "#c9a84c", me: "#f2d58a", pick: "#f2d58a" };
const MINI_SCALE = 10;
const FULL_SCALE = 22;
const READER_PAGE_SIZE = 50;
/** How close (px) a click must be to a reader's dot to pick the reader rather than the gallery. */
const PICK_RADIUS = 9;

type Target = { kind: "gallery"; cell: Cell } | { kind: "readers"; ids: string[]; cell: Cell } | { kind: "note"; note: Note; cell: Cell };

/** Me on the map: my gallery and where along it I stand. */
function myPoint(stage: StageStore): { cell: Cell; along: number } | null {
  const place = stage.getSnapshot().place;
  if (!place) return null;
  const pose = stage.commands.visitorPose?.();
  if (!pose) return { cell: place.cell, along: 0.5 };
  const [cx, cy, cz] = galleryCenter(place.col, place.level);
  return { cell: place.cell, along: alongOf([pose.position.x - cx, pose.position.y - cy, pose.position.z - cz]) };
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, view: MapView, online: OnlineStore, stage: StageStore, mode: "mini" | "full", picked: Cell | null, groups: readonly ReaderGroup[]) {
  const cw = view.scale;
  const ch = view.scale * FLOOR_RATIO;
  ctx.fillStyle = COLOURS.fog;
  ctx.fillRect(0, 0, w, h);

  // Explored galleries.
  ctx.fillStyle = COLOURS.explored;
  const chunks = visibleChunks(view, w, h);
  for (const key of chunks) {
    const bits = online.chunks.get(key);
    const chunk = bits && parseCellKey(key);
    if (!bits || !chunk) continue;
    for (let i = 0; i < 1024; i++) {
      if (!hasBit(bits, i)) continue;
      const [x, y] = pointOf(view, w, h, bitCell(chunk, i), 0, 1);
      if (x > -cw && x < w && y > -ch && y < h) ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
    }
  }

  const pins = new Set<string>();
  for (const key of chunks) for (const note of online.notes.get(key) ?? []) {
    if (pins.has(note.cell)) continue;
    pins.add(note.cell);
    const cell = parseCellKey(note.cell);
    if (!cell) continue;
    const [x, y] = pointOf(view, w, h, cell, 0.5, 0.8);
    if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
    ctx.fillStyle = "#c0392b";
    ctx.strokeStyle = "#e6dbc2";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // The grid of galleries and floors, when there is room for it.
  if (cw >= 16) {
    ctx.strokeStyle = COLOURS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const [x0, y0] = pointOf(view, w, h, cellAtPoint(view, w, h, 0, 0), 0, 1);
    for (let x = x0; x < w; x += cw) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
    for (let y = y0; y < h; y += ch) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
    ctx.stroke();
  }

  // The centre of the Library.
  const [ox, oy] = pointOf(view, w, h, CENTRE);
  if (ox > -20 && ox < w + 20 && oy > -20 && oy < h + 20) {
    ctx.strokeStyle = COLOURS.centre;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ox, oy, Math.max(4, cw * 0.45), 0, Math.PI * 2);
    ctx.moveTo(ox - 8, oy);
    ctx.lineTo(ox + 8, oy);
    ctx.moveTo(ox, oy - 8);
    ctx.lineTo(ox, oy + 8);
    ctx.stroke();
  }

  // The gallery picked in the full map.
  if (picked) {
    const [px, py] = pointOf(view, w, h, picked, 0, 1);
    ctx.strokeStyle = COLOURS.pick;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, cw - 2, ch - 2);
  }

  // The others, then me on top.
  const r = Math.max(3, cw / 6);
  ctx.font = "11px var(--font-jetbrains), monospace";
  for (const { x, y, readers } of groups) {
    const crowded = readers.length > 1;
    const player = readers[0].player;
    ctx.fillStyle = crowded ? COLOURS.fog : player.color;
    ctx.beginPath();
    ctx.arc(x, y, crowded ? GROUP_RADIUS : r, 0, Math.PI * 2);
    ctx.fill();
    if (crowded) {
      ctx.strokeStyle = COLOURS.centre;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = COLOURS.me;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(readers.length), x, y);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    } else if (mode === "full" && cw >= 16 && groups.length < 30) ctx.fillText(player.nick, x + r + 3, y + 4);
  }
  const me = myPoint(stage);
  if (me) {
    const [x, y] = pointOf(view, w, h, me.cell, me.along, 0.35);
    const group = pickReaderGroup(groups, x, y);
    const crowded = group && group.readers.length > 1;
    ctx.strokeStyle = COLOURS.me;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(crowded ? group.x : x, crowded ? group.y : y, crowded ? GROUP_RADIUS + 3 : r + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * The map of the Library: a vertical cross-section, column right, floor up. "mini" follows the visitor and opens the
 * full map on a click; "full" pans, zooms, and takes you to a gallery or a reader.
 */
export default function LibraryMap({ mode, onExpand, onClose }: { mode: "mini" | "full"; onExpand?: () => void; onClose?: () => void }) {
  const t = useTranslations("Map");
  const router = useRouter();
  const stage = useStageStore();
  const online = useOnlineStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<MapView | null>(null);
  const picked = useRef<Cell | null>(null);
  const groups = useRef<ReaderGroup[]>([]);
  const dirty = useRef(true);
  const panel = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<(Target & { x: number; y: number }) | null>(null);
  const [selected, setSelected] = useState<MapReader[]>([]);
  const [readerQuery, setReaderQuery] = useState("");
  const [readerLimit, setReaderLimit] = useState(READER_PAGE_SIZE);
  const selectedIds = target?.kind === "readers" ? target.ids : null;
  const query = readerQuery.trim().toLowerCase();
  const matchingReaders = query ? selected.filter(({ player }) => player.nick.toLowerCase().includes(query)) : selected;

  useEffect(() => { panel.current?.focus(); }, [target]);

  useEffect(() => {
    if (!selectedIds) return;
    const timer = setInterval(() => {
      const el = canvas.current;
      if (!el || !view.current) return;
      const anchor = selectedIds.find((id) => online.getSnapshot().players.has(id));
      const next = groupReaders(currentReaders(online), view.current, el.clientWidth, el.clientHeight)
        .find((group) => group.readers.some((reader) => reader.player.id === anchor))?.readers ?? [];
      setSelected((previous) => previous.length === next.length && previous.every((reader, i) => {
        const other = next[i];
        return reader.player.id === other.player.id && reader.player.nick === other.player.nick && reader.player.color === other.player.color && sameCell(reader.cell, other.cell) && JSON.stringify(reader.player.view) === JSON.stringify(other.player.view);
      }) ? previous : next);
    }, 100);
    return () => clearInterval(timer);
  }, [online, selectedIds]);

  // Poll incoming poses at 10 Hz; dragging, zooming and picking draw on the next animation frame.
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    let frame = 0;
    let last = 0;
    let asked = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!dirty.current && now - last < 100) return;
      dirty.current = false;
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const me = myPoint(stage);
      if (!view.current || mode === "mini") view.current = me ? viewAround(me.cell, view.current?.scale ?? (mode === "mini" ? MINI_SCALE : FULL_SCALE), me.along, 0.5) : viewAround(CENTRE, FULL_SCALE);
      if (now - asked > 300) {
        asked = now;
        online.watch(visibleChunks(view.current, w, h));
      }
      groups.current = groupReaders(currentReaders(online), view.current, w, h);
      draw(ctx, w, h, view.current, online, stage, mode, picked.current, groups.current);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [mode, online, stage]);

  // Dragging, zooming and picking (full map only).
  useEffect(() => {
    const el = canvas.current;
    if (!el || mode !== "full") return;
    let drag: { x: number; y: number; moved: number } | null = null;
    const clearTarget = () => {
      setTarget(null);
      setReaderQuery("");
      setReaderLimit(READER_PAGE_SIZE);
      picked.current = null;
    };
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
    };
    const move = (e: PointerEvent) => {
      if (!view.current) return;
      if (!drag) {
        const [px, py] = local(e);
        const hit = pickReaderGroup(groups.current, px, py);
        el.title = hit ? hit.readers.length === 1 ? hit.readers[0].player.nick : t("readers", { count: hit.readers.length }) : "";
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY, moved: drag.moved + Math.hypot(dx, dy) };
      view.current = pan(view.current, dx, dy);
      dirty.current = true;
      clearTarget();
    };
    const up = (e: PointerEvent) => {
      const click = drag && drag.moved < 4;
      drag = null;
      if (!click || !view.current) return;
      const [px, py] = local(e);
      const w = el.clientWidth;
      const h = el.clientHeight;
      const hit = pickReaderGroup(groupReaders(currentReaders(online), view.current, w, h), px, py);
      let pin: { note: Note; cell: Cell } | undefined;
      if (!hit) for (const key of visibleChunks(view.current, w, h)) {
        for (const note of online.notes.get(key) ?? []) {
          const cell = parseCellKey(note.cell);
          if (!cell) continue;
          const [x, y] = pointOf(view.current, w, h, cell, 0.5, 0.8);
          if (Math.hypot(x - px, y - py) < PICK_RADIUS) { pin = { note, cell }; break; }
        }
        if (pin) break;
      }
      const cell = hit?.readers[0].cell ?? pin?.cell ?? cellAtPoint(view.current, w, h, px, py);
      picked.current = cell;
      dirty.current = true;
      setReaderQuery("");
      setReaderLimit(READER_PAGE_SIZE);
      if (hit) setSelected(hit.readers);
      setTarget(hit ? { kind: "readers", ids: hit.readers.map((reader) => reader.player.id), cell, x: px, y: py } : pin ? { kind: "note", note: pin.note, cell, x: px, y: py } : { kind: "gallery", cell, x: px, y: py });
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!view.current) return;
      const [px, py] = local(e);
      view.current = zoomAt(view.current, Math.exp(-e.deltaY * 0.0015), px, py, el.clientWidth, el.clientHeight);
      dirty.current = true;
      clearTarget();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    const cancel = () => { drag = null; };
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("wheel", wheel);
    };
  }, [mode, online, t]);

  const go = (href: string) => {
    onClose?.();
    router.push(href);
  };
  const explored = (cell: Cell) => {
    const bits = online.chunks.get(chunkKeyOf(cell));
    return bits ? hasBit(bits, cellBit(cell)) : false;
  };
  const me = target && myPoint(stage);
  const panelTop = Math.max(4, Math.min((target?.y ?? 0) + 12, (canvas.current?.clientHeight ?? 320) - 320));
  const visit = (id: string, book: boolean) => {
    const reader = currentReaders(online).find((reader) => reader.player.id === id);
    if (reader) go(book ? viewHref(reader.cell, reader.player.view) : placeHref(reader.cell, reader.player.view.wall));
  };

  return (
    <Box position="relative" w="100%" h="100%">
      <chakra.canvas
        ref={canvas}
        display="block"
        w="100%"
        h="100%"
        touchAction="none"
        cursor={mode === "mini" ? "pointer" : "grab"}
        onClick={mode === "mini" ? onExpand : undefined}
        aria-label={mode === "mini" ? t("open") : t("title")}
        role={mode === "mini" ? "button" : "img"}
        tabIndex={mode === "mini" ? 0 : undefined}
        onKeyDown={mode === "mini" ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onExpand?.(); } } : undefined}
        onPointerMove={mode === "mini" ? (event) => {
          const el = event.currentTarget;
          if (!view.current) return;
          const rect = el.getBoundingClientRect();
          const hit = pickReaderGroup(groups.current, event.clientX - rect.left, event.clientY - rect.top);
          el.title = hit ? hit.readers.length === 1 ? hit.readers[0].player.nick : t("readers", { count: hit.readers.length }) : t("open");
        } : undefined}
      />
      {target && (
        <Box
          ref={panel}
          role="region"
          aria-label={target.kind === "readers" ? t("readers", { count: selected.length }) : t("gallery", { x: formatCoordinate(target.cell.x), floor: formatCoordinate(target.cell.floor) })}
          tabIndex={-1}
          position="absolute"
          left={`${Math.max(4, Math.min(target.x + 12, (canvas.current?.clientWidth ?? 300) - 300))}px`}
          top={`${panelTop}px`}
          p={3}
          borderRadius="8px"
          bg="rgba(8,8,15,0.94)"
          border="1px solid"
          borderColor="brand.300/30"
          fontFamily="var(--font-jetbrains), monospace"
          fontSize="11px"
          color="dark.100"
          minW="220px"
          w="300px"
          maxW="calc(100% - 8px)"
          maxH={`calc(100% - ${panelTop + 4}px)`}
          overflowY="auto"
        >
          <Flex justify="space-between" gap={3} mb={2} align="baseline">
            {target.kind === "readers" && <Text>{t("readers", { count: selected.length })}</Text>}
            <chakra.button ml="auto" color="brand.300" cursor="pointer" onClick={() => { setTarget(null); setReaderQuery(""); setReaderLimit(READER_PAGE_SIZE); picked.current = null; dirty.current = true; }}>{t("close")}</chakra.button>
          </Flex>
          {target.kind === "readers" ? <>
            <Input type="search" size="sm" mb={2} value={readerQuery} aria-label={t("searchReaders")} placeholder={t("searchReaders")} onChange={(event) => { setReaderQuery(event.target.value); setReaderLimit(READER_PAGE_SIZE); }} color="dark.100" bg="rgba(7,6,10,0.92)" borderColor="brand.300/30" />
            <Box as="ul" m={0} p={0} listStyleType="none">
              {matchingReaders.slice(0, readerLimit).map(({ player, cell }) => (
                <Box as="li" key={player.id} py={2} borderTop="1px solid" borderColor="brand.300/20" overflowWrap="anywhere">
                  <Text color={player.color}>{player.nick}</Text>
                  <Text color="dark.300">{player.view.kind === "desk" ? t("reading", player.view) : player.view.kind === "shelf" ? t("atShelf", player.view) : t("walking")}</Text>
                  <Text>{t("gallery", { x: formatCoordinate(cell.x), floor: formatCoordinate(cell.floor) })}</Text>
                  <Flex gap={3} mt={1} wrap="wrap">
                    <chakra.button onClick={() => visit(player.id, false)} color="brand.300" cursor="pointer">{t("goTo")}</chakra.button>
                    {player.view.kind !== "walk" && <chakra.button onClick={() => visit(player.id, true)} color="brand.300" cursor="pointer">{t("openBook")}</chakra.button>}
                  </Flex>
                </Box>
              ))}
            </Box>
            {matchingReaders.length > readerLimit && <chakra.button mt={2} onClick={() => setReaderLimit((limit) => limit + READER_PAGE_SIZE)} color="brand.300" cursor="pointer">{t("showMore")}</chakra.button>}
          </> : <>
            {target.kind === "note" && <><Text color={target.note.color}>{target.note.nick}</Text><Text wordBreak="break-word">{target.note.text}</Text></>}
            <Text>{t("gallery", { x: formatCoordinate(target.cell.x), floor: formatCoordinate(target.cell.floor) })}</Text>
            <Text color="dark.300" mb={2}>{explored(target.cell) ? t("explored") : t("unexplored")}</Text>
            {(target.kind === "note" || !(me && sameCell(me.cell, target.cell))) && (
              <chakra.button onClick={() => go(target.kind === "note" ? noteHref(target.note) : placeHref(target.cell))} color="brand.300" cursor="pointer">{t("goHere")}</chakra.button>
            )}
          </>}
        </Box>
      )}
    </Box>
  );
}
