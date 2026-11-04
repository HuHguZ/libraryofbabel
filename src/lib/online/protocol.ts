import { isLocale, type Locale } from "@/i18n/locales";
import { LIBRARY } from "@/lib/library";
import { cellKey, parseCellKey } from "@/lib/world";

export type View = { kind: "walk"; wall: number } | { kind: "shelf"; wall: number; shelf: number } | { kind: "desk"; wall: number; shelf: number; volume: number; page: number };
export type LoupeSample = [number, number, number, number, number, number, number, number, number];
export interface Reading {
  fragment?: { page: number; start: number; end: number; color: string };
  loupe?: { page: number; u: number; v: number; power: number; sample?: LoupeSample };
}
export interface Pose { cell: string; p: [number, number, number]; yaw: number; view: View; reading?: Reading }
export interface Player extends Pose { id: string; nick: string; color: string }
export interface Anchor { wall: number; shelf: number; volume: number; page: number; start: number; end: number }
export interface SharedPlace { cell: string; view: View; fragment?: { page: number; start: number; end: number }; note?: number }
export interface Note { id: number; cell: string; anchor: Anchor | null; text: string; author: string; nick: string; color: string; highlightColor?: string; at: string }
export interface ChatMessage { id: number; author: string; nick: string; color: string; text: string; place: SharedPlace | null; at: string }
export interface ActivityMessage { id: string; action: "joined" | "left"; nick: string; at: string }
export type ClientMessage =
  | { type: "hello"; lang: Locale; admin?: string }
  | ({ type: "pose" } & Pose)
  | { type: "profile"; nick?: string; color?: string }
  | { type: "watch"; chunks: string[] }
  | { type: "chat"; text: string; place?: SharedPlace }
  | { type: "note"; cell: string; anchor: Anchor | null; text: string; highlightColor?: string }
  | { type: "paint"; id: number; color: string }
  | { type: "share-note"; id: number }
  | { type: "forget"; kind: "note" | "chat"; id: number }
  | { type: "ban"; guest: string };
export type ServerMessage =
  | { type: "welcome"; you: { id: string; nick: string; color: string }; last: { cell: string; wall: number } | null; admin: boolean }
  | { type: "players"; list: Player[] }
  | { type: "poses"; list: ({ id: string } & Pose)[] }
  | { type: "left"; id: string }
  | { type: "chunk"; key: string; fog: string; notes: Note[] }
  | { type: "fog"; key: string; bit: number }
  | { type: "history"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "activity"; activity: ActivityMessage }
  | { type: "noted"; note: Note }
  | { type: "painted"; id: number; color: string }
  | { type: "forgotten"; kind: "note" | "chat"; id: number }
  | { type: "refused"; reason: "rate" | "length" | "banned" | "invalid" };
export const PLAYER_COLORS = ["#b02e3a", "#d9722b", "#c9a227", "#4f9a5a", "#2e8f9e", "#3a6fc4", "#7b52c7", "#c24d9a"] as const;
export const MAX_FRAME = 64 * 1024;
export const MAX_WATCH = 64;
export const TEXT_LIMIT = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const finite = (v: unknown, limit: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const cell = (v: unknown): v is string => typeof v === "string" && v.length <= 18000 && parseCellKey(v) !== null;
const canonicalCell = (key: string): string => cellKey(parseCellKey(key)!);
function printable(raw: unknown, min: number, max: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.normalize("NFC").replace(/\s+/gu, " ").trim();
  return value.length >= min && value.length <= max && !/\p{Cc}|\p{Cf}/u.test(value) ? value : null;
}
export const cleanNick = (raw: unknown): string | null => printable(raw, 2, 24);
export const cleanText = (raw: unknown): string | null => printable(raw, 1, TEXT_LIMIT);
export const cleanColor = (raw: unknown): string | null => typeof raw === "string" && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
function parseView(v: unknown): View | null {
  if (!record(v)) return null;
  if (v.kind === "walk") return integer(v.wall, 0, LIBRARY.walls) ? { kind: "walk", wall: v.wall } : null;
  if (!integer(v.wall, 1, LIBRARY.walls) || !integer(v.shelf, 1, LIBRARY.shelves)) return null;
  if (v.kind === "shelf") return { kind: "shelf", wall: v.wall, shelf: v.shelf };
  if (v.kind === "desk" && integer(v.volume, 1, LIBRARY.volumes) && integer(v.page, 0, LIBRARY.pages)) return { kind: "desk", wall: v.wall, shelf: v.shelf, volume: v.volume, page: v.page };
  return null;
}
function parseSpan(v: unknown): SharedPlace["fragment"] | null {
  return record(v) && integer(v.page, 1, LIBRARY.pages) && integer(v.start, 0, LIBRARY.pageLength - 1) && integer(v.end, 1, LIBRARY.pageLength) && v.start < v.end ? { page: v.page, start: v.start, end: v.end } : null;
}
function parseReading(v: unknown, view: View): Reading | null {
  if (!record(v) || view.kind !== "desk" || view.page === 0) return null;
  const reading: Reading = {};
  if (v.fragment !== undefined) {
    const span = parseSpan(v.fragment), color = record(v.fragment) ? cleanColor(v.fragment.color) : null;
    if (!span || !color) return null;
    reading.fragment = { ...span, color };
  }
  if (v.loupe !== undefined) {
    const loupe = v.loupe;
    if (!record(loupe) || !integer(loupe.page, 1, LIBRARY.pages) || !finite(loupe.u, 1) || loupe.u < 0 || !finite(loupe.v, 1) || loupe.v < 0 || !finite(loupe.power, 6) || loupe.power < 1.5) return null;
    if (loupe.sample !== undefined && (!Array.isArray(loupe.sample) || loupe.sample.length !== 9 || !loupe.sample.every(n => finite(n, 10000)) || loupe.sample[8] !== 1)) return null;
    reading.loupe = { page: loupe.page, u: loupe.u, v: loupe.v, power: loupe.power, ...(loupe.sample !== undefined && { sample: [...loupe.sample as LoupeSample] as LoupeSample }) };
  }
  return reading;
}
function parseAnchor(v: unknown): Anchor | null {
  const span = parseSpan(v);
  return span && record(v) && integer(v.wall, 1, LIBRARY.walls) && integer(v.shelf, 1, LIBRARY.shelves) && integer(v.volume, 1, LIBRARY.volumes) ? { wall: v.wall, shelf: v.shelf, volume: v.volume, ...span } : null;
}
function parsePlace(v: unknown): SharedPlace | null {
  if (!record(v) || !cell(v.cell)) return null;
  const view = parseView(v.view);
  if (!view) return null;
  if (v.fragment === undefined) return { cell: canonicalCell(v.cell), view };
  const fragment = parseSpan(v.fragment);
  return fragment && view.kind === "desk" ? { cell: canonicalCell(v.cell), view, fragment } : null;
}
/** Only validated fields cross the network boundary. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_FRAME || new TextEncoder().encode(raw).length > MAX_FRAME) return null;
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!record(o)) return null;
  switch (o.type) {
    case "hello":
      if (!isLocale(o.lang) || (o.admin !== undefined && (typeof o.admin !== "string" || o.admin.length > 200))) return null;
      return { type: "hello", lang: o.lang, ...(o.admin !== undefined && { admin: o.admin as string }) };
    case "pose": {
      const view = parseView(o.view);
      if (!cell(o.cell) || !view || !finite(o.yaw, 10) || !Array.isArray(o.p) || o.p.length !== 3 || !o.p.every(v => finite(v, 50))) return null;
      const reading = o.reading === undefined ? undefined : parseReading(o.reading, view);
      if (reading === null) return null;
      return { type: "pose", cell: canonicalCell(o.cell), p: [o.p[0], o.p[1], o.p[2]], yaw: o.yaw, view, ...(reading && { reading }) };
    }
    case "profile": {
      const nick = o.nick === undefined ? undefined : cleanNick(o.nick);
      const color = o.color === undefined ? undefined : cleanColor(o.color);
      if (nick === null || color === null || (nick === undefined && color === undefined)) return null;
      return { type: "profile", ...(nick !== undefined && { nick }), ...(color !== undefined && { color }) };
    }
    case "watch":
      return Array.isArray(o.chunks) && o.chunks.length > 0 && o.chunks.length <= MAX_WATCH && o.chunks.every(cell) ? { type: "watch", chunks: [...new Set(o.chunks.map(canonicalCell))] } : null;
    case "chat": {
      const text = cleanText(o.text);
      if (!text) return null;
      if (o.place === undefined) return { type: "chat", text };
      const place = parsePlace(o.place);
      return place ? { type: "chat", text, place } : null;
    }
    case "note": {
      const anchor = o.anchor === undefined || o.anchor === null ? null : parseAnchor(o.anchor);
      const highlightColor = o.highlightColor === undefined ? undefined : cleanColor(o.highlightColor);
      if (highlightColor === null || (highlightColor !== undefined && !anchor)) return null;
      const text = o.text === "" && anchor && highlightColor ? "" : cleanText(o.text);
      return text !== null && cell(o.cell) && (o.anchor == null || anchor) ? { type: "note", cell: canonicalCell(o.cell), anchor, text, ...(highlightColor && { highlightColor }) } : null;
    }
    case "paint": {
      const color = cleanColor(o.color);
      return color && integer(o.id, 1, Number.MAX_SAFE_INTEGER) ? { type: "paint", id: o.id, color } : null;
    }
    case "share-note": return integer(o.id, 1, Number.MAX_SAFE_INTEGER) ? { type: "share-note", id: o.id } : null;
    case "forget": return (o.kind === "note" || o.kind === "chat") && integer(o.id, 1, Number.MAX_SAFE_INTEGER) ? { type: "forget", kind: o.kind, id: o.id } : null;
    case "ban": return typeof o.guest === "string" && UUID.test(o.guest) ? { type: "ban", guest: o.guest } : null;
    default: return null;
  }
}
