"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { hashString } from "@/lib/hex";
import { LIBRARY } from "@/lib/library";
import { galleryCenter } from "@/components/explore/geometry";
import { LibraryMaterialsProvider } from "@/components/explore/materials";
import DeskBook from "@/components/explore/stage/DeskBook";
import { nearestDesk, type ReaderLayout } from "./remoteReading";
import { useStageStore } from "@/components/explore/stage/StageProvider";
import { useOnlineStore, useOnlineSelector } from "./OnlineProvider";
import { viewHref } from "./teleport";
import { stepRemoteBooks, type RemoteVolume } from "./remoteBookMotion";
import { liveHighlights, liveLoupes } from "./remoteReading";
import { chunkKeyOf } from "@/lib/world";

type PageData = { title: string; contents: Record<number, string> };
const pageCache = new Map<string, PageData>();

function RemoteVolume({ volume }: { volume: RemoteVolume }) {
  const locale = useLocale(), t = useTranslations("Online"), router = useRouter(), stage = useStageStore(), online = useOnlineStore();
  const { book, page, frame, reader } = volume, spread = Math.floor(Math.max(1, page) / 2);
  const notesVersion = useOnlineSelector(s => s.notesVersion), selectionsVersion = useOnlineSelector(s => s.selectionsVersion);
  useEffect(() => online.watch([chunkKeyOf(reader.cell)]), [online, reader.cell]);
  const notes = useMemo(() => { void notesVersion; return online.notesAt(reader.cell).filter(n => n.anchor?.wall === book.wall && n.anchor.shelf === book.shelf && n.anchor.volume === book.volume); }, [online, reader.cell, book, notesVersion]);
  const highlights = useMemo(() => notes.map(n => ({ ...n.anchor!, color: n.highlightColor ?? n.color })), [notes]);
  const drafts = useMemo(() => { void selectionsVersion; return liveHighlights(online.getSnapshot().players.values(), online.tracks, reader.cell, book, notes); }, [online, reader.cell, book, notes, selectionsVersion]);
  const getLoupes = useMemo(() => () => { const owner = online.getSnapshot().players.get(reader.player.id); return owner ? liveLoupes([owner], online.tracks, reader.cell, book) : []; }, [online, reader.cell, reader.player.id, book]);
  const key = `${locale}:${book.hex}:${book.wall}:${book.shelf}:${book.volume}:${spread}`;
  const [data, setData] = useState<{ key: string; value: PageData } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const cached = pageCache.get(key);
    const request = cached ? Promise.resolve(cached) : fetch("/api/spread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...book, pages: [spread * 2, spread * 2 + 1].filter(p => p >= 1 && p <= LIBRARY.pages), lang: locale }), signal: controller.signal })
      .then(r => { if (!r.ok) throw Error("Remote pages unavailable"); return r.json(); })
      .then((v: { title?: string; pages?: { page: number; content: string }[] }) => ({ title: v.title ?? "", contents: Object.fromEntries((v.pages ?? []).map(p => [p.page, p.content])) }));
    void request.then(value => {
      if (controller.signal.aborted) return;
      pageCache.delete(key); pageCache.set(key, value);
      while (pageCache.size > 32) pageCache.delete(pageCache.keys().next().value!);
      setData({ key, value });
    }).catch(() => { /* The volume remains visible while its page is offline or was superseded. */ });
    return () => controller.abort();
  }, [key, book, locale, spread]);
  const inputs = useMemo(() => ({ title: data?.key === key ? data.value.title : "", contents: data?.key === key ? data.value.contents : {}, spread: page === 0 ? 0 : spread, query: "", loupe: false, highlights, liveHighlights: drafts, getLoupes }), [data, key, page, spread, highlights, drafts, getLoupes]);
  const label = useRef<HTMLDivElement>(null);
  useFrame(({ camera }) => { if (label.current) label.current.style.display = camera.position.distanceTo(frame.position) < 7 ? "block" : "none"; });
  const join = () => {
    const player = online.getSnapshot().players.get(reader.player.id);
    const sample = online.tracks.get(reader.player.id)?.at(-1);
    if (!player || (sample?.view ?? player.view).kind !== "desk") return;
    stage.commands.release?.();
    router.push(viewHref(sample?.cell ?? reader.cell, sample?.view ?? player.view));
  };
  return <group name={`remote-book:${reader.player.id}`}>
      <DeskBook key={volume.key} book={book} frame={frame} mode={page === 0 ? "index" : "read"} inputs={inputs} controlsEnabled={false} interactive={false} motion={volume.motion} observer />
      <Html position={[frame.position.x, frame.position.y + 0.22, frame.position.z]} center occlude style={{ pointerEvents: "none" }}>
        <div ref={label} style={{ font: "11px var(--font-jetbrains), monospace", whiteSpace: "nowrap", background: "rgba(8,8,15,.88)", border: "1px solid #685327", borderRadius: 6, padding: "5px 8px", color: "#eee5d1", pointerEvents: "auto" }}>
          <span style={{ color: reader.player.color }}>{reader.player.nick}</span> · {t("bookPage", { page })} <button onClick={join} style={{ color: "#e6d2a0", cursor: "pointer", marginLeft: 8 }}>{t("joinReading")}</button>
        </div>
      </Html>
    </group>;
}

/** At most eight observer books, including books currently flying back to their shelves. */
export default function RemoteBooks({ readers }: { readers: ReaderLayout[] }) {
  const stage = useStageStore(), online = useOnlineStore();
  const books = useRef(new Map<string, RemoteVolume>()), pending = useRef(new Set<string>());
  const previous = useRef({ origin: "", render: "", gaps: "" });
  const [visible, setVisible] = useState<RemoteVolume[]>([]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __stage?: Record<string, unknown> };
    const debug = w.__stage ??= {};
    debug.remoteBooks = books.current; debug.remotePages = pageCache;
    return () => { delete debug.remoteBooks; delete debug.remotePages; };
  }, []);
  useEffect(() => () => { books.current.clear(); pending.current.clear(); if (stage.getSnapshot().remoteVolumes.length) stage.patch({ remoteVolumes: [] }); }, [stage]);
  useFrame((_, dt) => {
    const snapshot = stage.getSnapshot(), place = snapshot.place;
    const origin = place ? `${place.cell.x - BigInt(place.col)}:${place.cell.floor - BigInt(place.level)}` : "";
    if (previous.current.origin !== origin || online.getSnapshot().status !== "online") { books.current.clear(); pending.current.clear(); previous.current.origin = origin; }
    if (place && online.getSnapshot().status === "online") {
      const pose = snapshot.view?.kind === "desk" ? stage.commands.visitorPose?.() : null;
      const [cx, , cz] = galleryCenter(place.col, place.level);
      const own = pose ? { wall: nearestDesk({ x: pose.position.x - cx, y: 0, z: pose.position.z - cz }), col: place.col, level: place.level } : null;
      stepRemoteBooks(books.current, readers, own, dt, pending.current);
    }
    const values = [...books.current.values()];
    const render = values.map(v => `${v.key}:${v.page}:${v.frameKey}:${v.reader.player.nick}:${v.reader.player.color}`).join("|");
    if (render !== previous.current.render) { previous.current.render = render; setVisible(values); }
    const gaps = values.map(v => `${v.key}:${v.reader.col}:${v.reader.level}:${v.reader.desk}`).join("|");
    if (gaps !== previous.current.gaps) {
      previous.current.gaps = gaps;
      stage.patch({ remoteVolumes: values.map(v => ({ level: v.reader.level, col: v.reader.col, wall: v.book.wall, shelf: v.book.shelf, volume: v.book.volume, desk: v.reader.desk ?? undefined })) });
    }
  }, -1.5);
  const galleries = new Map<string, RemoteVolume[]>();
  for (const volume of visible) { const list = galleries.get(volume.book.hex) ?? []; list.push(volume); galleries.set(volume.book.hex, list); }
  return <>{[...galleries].map(([hex, volumes]) => <Suspense key={hex} fallback={null}><LibraryMaterialsProvider seed={hashString(hex)}>
    {volumes.map(volume => <RemoteVolume key={volume.key} volume={volume} />)}
  </LibraryMaterialsProvider></Suspense>)}</>;
}
