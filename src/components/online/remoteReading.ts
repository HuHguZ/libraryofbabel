import * as THREE from "three";
import type { Player, View, Note, Reading } from "@/lib/online/protocol";
import { parseCellKey, type Cell } from "@/lib/world";
import { BOOK_SCALE, deskCenterLocal, deskFrame, type DeskFrame } from "@/components/explore/stage/deskFrame";
import { galleryCenter, ROOM } from "@/components/explore/geometry";
import type { Track } from "./presence";

export const MAX_REMOTE_READERS = 24;
export const MAX_REMOTE_BOOKS = 8;
export type LiveHighlight = { author: string; nick: string; page: number; start: number; end: number; color: string };
export type SharedLoupe = NonNullable<Reading["loupe"]> & { color: string };
type Book = { wall: number; shelf: number; volume: number };

function sameReading(player: Player, tracks: ReadonlyMap<string, Track>, cell: Cell, book: Book) {
  const source = tracks.get(player.id)?.at(-1) ?? player;
  const at = typeof source.cell === "string" ? parseCellKey(source.cell) : source.cell;
  return at?.x === cell.x && at.floor === cell.floor && source.view.kind === "desk" && source.view.wall === book.wall && source.view.shelf === book.shelf && source.view.volume === book.volume ? source.reading : undefined;
}
/** Drafts are presence, never notes; a saved copy of the same author's range replaces the draft wash. */
export function liveHighlights(players: Iterable<Player>, tracks: ReadonlyMap<string, Track>, cell: Cell, book: Book, notes: readonly Note[] = []): LiveHighlight[] {
  const saved = new Set(notes.filter(n => n.anchor).map(n => `${n.author}:${n.anchor!.page}:${n.anchor!.start}:${n.anchor!.end}`));
  const out: LiveHighlight[] = [];
  for (const p of players) {
    const fragment = sameReading(p, tracks, cell, book)?.fragment;
    if (fragment && !saved.has(`${p.id}:${fragment.page}:${fragment.start}:${fragment.end}`)) out.push({ ...fragment, author: p.id, nick: p.nick });
  }
  return out;
}
export function liveLoupes(players: Iterable<Player>, tracks: ReadonlyMap<string, Track>, cell: Cell, book: Book): SharedLoupe[] {
  const out: SharedLoupe[] = [];
  for (const p of players) { const reading = sameReading(p, tracks, cell, book); if (reading?.loupe) out.push({ ...reading.loupe, color: p.color }); }
  return out;
}
type Place = { cell: Cell; col: number; level: number };
export interface ReaderLayout {
  player: Player;
  cell: Cell;
  view: View;
  col: number;
  level: number;
  desk: number | null;
  slot: number;
  bookSlot: number | null;
  arrive?: boolean;
}

/** A book swap can keep the previous desk: the physical position, rather than the book's wall, identifies it. */
export function nearestDesk(p: THREE.Vector3Like): number {
  let best = 1, distance = Infinity;
  for (let wall = 1; wall <= 4; wall++) {
    const c = deskCenterLocal(wall), d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < distance) { best = wall; distance = d; }
  }
  return best;
}

/** Cull before cloning skinned models or allocating page textures; far BigInts never become Numbers. */
export function nearbyReaders(players: Iterable<Player>, tracks: ReadonlyMap<string, Track>, place: Place): ReaderLayout[] {
  const candidates: ReaderLayout[] = [];
  for (const player of players) {
    const sample = tracks.get(player.id)?.at(-1), cell = sample?.cell ?? parseCellKey(player.cell);
    if (!cell) continue;
    const dx = cell.x - place.cell.x, dy = cell.floor - place.cell.floor;
    if (dx < -2n || dx > 2n || dy < -1n || dy > 1n) continue;
    const view = sample?.view ?? player.view, p = sample?.p ?? player.p;
    candidates.push({ player, cell, view, col: place.col + Number(dx), level: place.level + Number(dy), desk: view.kind === "desk" ? nearestDesk({ x: p[0], z: p[2], y: 0 }) : null, slot: 0, bookSlot: null });
  }
  candidates.sort((a, b) => Math.abs(a.col - place.col) + Math.abs(a.level - place.level) - Math.abs(b.col - place.col) - Math.abs(b.level - place.level) || a.player.id.localeCompare(b.player.id));
  const seats = new Map<string, number>(), out: ReaderLayout[] = [];
  let books = 0;
  for (const candidate of candidates) {
    if (candidate.desk !== null) {
      const key = `${candidate.col}:${candidate.level}:${candidate.desk}`, slot = seats.get(key) ?? 0;
      if (slot >= 6) continue;
      seats.set(key, slot + 1); candidate.slot = slot;
      if (slot < 2 && books < MAX_REMOTE_BOOKS) { candidate.bookSlot = slot; books++; }
    }
    out.push(candidate);
    if (out.length >= MAX_REMOTE_READERS) break;
  }
  return out;
}

/** Two remote volumes share the tabletop; beside a local open book they use the remaining side strips. */
export function readerBookFrame(reader: ReaderLayout, ownDesk: number | null = null): DeskFrame {
  const frame = deskFrame(reader.level, reader.col, reader.desk!);
  const shared = ownDesk === reader.desk;
  const across = (reader.bookSlot === 1 ? 1 : -1) * (shared ? 0.31 : 0.18);
  frame.position.x += Math.cos(frame.yaw) * across + Math.sin(frame.yaw) * 0.03;
  frame.position.z -= Math.sin(frame.yaw) * across - Math.cos(frame.yaw) * 0.03;
  frame.scale = BOOK_SCALE * (shared ? 0.35 : 0.65);
  return frame;
}

/** Stable places on the reader's side of a desk, all looking towards the book rather than the shelves. */
export function readingPosition(reader: ReaderLayout): { x: number; y: number; z: number; yaw: number } {
  const frame = deskFrame(reader.level, reader.col, reader.desk!);
  const across = [-0.34, 0.34, -0.55, 0, 0.55, 0][reader.slot];
  const radius = reader.slot < 2 ? 1.9 : reader.slot < 5 ? 2.4 : 2.95;
  const [cx, cy, cz] = galleryCenter(reader.col, reader.level);
  const x = cx + Math.sin(frame.yaw) * radius + Math.cos(frame.yaw) * across;
  const z = cz + Math.cos(frame.yaw) * radius - Math.sin(frame.yaw) * across;
  return { x, y: cy + ROOM.eyeHeight, z, yaw: Math.atan2(frame.position.x - x, frame.position.z - z) };
}
