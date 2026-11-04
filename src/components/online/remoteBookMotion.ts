import * as THREE from "three";
import type { BookAddress } from "@/components/explore/stage/stageStore";
import type { BookMotion } from "@/components/explore/stage/DeskBook";
import { deskBookPose, deskFrame, deskWatchShot, readerHomeShot, shelfBookPose, type DeskFrame } from "@/components/explore/stage/deskFrame";
import { takeTimeline, returnTimeline, type StageFrame, type Timeline } from "@/components/explore/stage/timeline";
import { hashString } from "@/lib/hex";
import { addressOf, cellKey } from "@/lib/world";
import { MAX_REMOTE_BOOKS, readerBookFrame, type ReaderLayout } from "./remoteReading";

export interface RemoteVolume {
  key: string;
  book: BookAddress;
  reader: ReaderLayout;
  frame: DeskFrame;
  page: number;
  motion: BookMotion;
  flight: { timeline: Timeline; kind: "take" | "return"; direction: 1 | -1; t: number; sample: StageFrame } | null;
  frameKey: string;
}
const identity = (r: ReaderLayout) => r.view.kind === "desk" && r.bookSlot !== null ? `${cellKey(r.cell)}:${r.view.wall}:${r.view.shelf}:${r.view.volume}` : null;
const frameKey = (r: ReaderLayout, ownDesk: number | null) => `${r.col}:${r.level}:${r.desk}:${r.bookSlot}:${ownDesk}`;

function flight(volume: RemoteVolume, kind: "take" | "return"): NonNullable<RemoteVolume["flight"]> {
  const { book, frame, reader } = volume, seed = hashString(book.hex);
  const shelf = shelfBookPose(reader.level, reader.col, book.wall, book.shelf, book.volume, seed), desk = deskBookPose(frame);
  // The shelf's inward normal comes from its wall, independent of the desk retained by a swap.
  const yaw = deskFrame(reader.level, reader.col, book.wall).yaw;
  const normal = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const input = { bookFrom: kind === "take" ? shelf : desk, bookTo: kind === "take" ? desk : shelf, shelfNormal: normal, cameraFrom: deskWatchShot(frame, 58), cameraTo: readerHomeShot(frame), seed };
  const timeline = kind === "take" ? takeTimeline(input) : returnTimeline(input);
  return { timeline, kind, direction: 1, t: 0, sample: timeline.sample(0) };
}

/** Mutates only observer-owned book motions; the shared camera and local page inputs are never touched. */
export function stepRemoteBooks(books: Map<string, RemoteVolume>, readers: ReaderLayout[], own: { wall: number; col: number; level: number } | null, dt: number, pending: Set<string>): void {
  const occupied = (r: ReaderLayout) => own && own.col === r.col && own.level === r.level ? own.wall : null;
  const targets = new Map(readers.filter(r => identity(r) !== null).map(r => [r.player.id, r]));
  for (const id of pending) if (!targets.has(id)) pending.delete(id);
  for (const r of targets.values()) if (r.arrive) pending.add(r.player.id);
  for (const [id, volume] of books) {
    const target = targets.get(id), same = !!target && volume.key === `${id}:${identity(target)}`;
    if (same) {
      volume.reader = target;
      volume.page = target.view.kind === "desk" ? target.view.page : volume.page;
      const key = frameKey(target, occupied(target));
      if (key !== volume.frameKey && !volume.flight) { volume.frame = readerBookFrame(target, occupied(target)); volume.frameKey = key; }
    } else if (target) pending.add(id); else pending.delete(id);
    if (!same && !volume.flight) volume.flight = flight(volume, "return");
    const f = volume.flight;
    if (!f) continue;
    f.direction = f.kind === "take" ? (same ? 1 : -1) : (same ? -1 : 1);
    f.t = THREE.MathUtils.clamp(f.t + Math.min(dt, 0.1) * f.direction, 0, f.timeline.duration);
    f.timeline.sample(f.t, f.sample);
    volume.motion.pose = f.sample.book; volume.motion.openness = f.sample.openness;
    if ((f.direction > 0 && f.t >= f.timeline.duration) || (f.direction < 0 && f.t <= 0)) {
      if ((f.kind === "take") === (f.direction > 0)) { volume.flight = null; volume.motion.pose = null; volume.motion.openness = 1; }
      else books.delete(id);
    }
  }
  for (const [id, target] of targets) {
    if (books.has(id) || books.size >= MAX_REMOTE_BOOKS || target.view.kind !== "desk") continue;
    if ([...books.values()].filter(v => v.reader.col === target.col && v.reader.level === target.level && v.reader.desk === target.desk).length >= 2) continue;
    const key = identity(target)!;
    const volume: RemoteVolume = { key: `${id}:${key}`, book: { hex: addressOf(target.cell), wall: target.view.wall, shelf: target.view.shelf, volume: target.view.volume }, reader: target, frame: readerBookFrame(target, occupied(target)), frameKey: frameKey(target, occupied(target)), page: target.view.page, motion: { pose: null, openness: 1 }, flight: null };
    if (pending.delete(id)) { volume.flight = flight(volume, "take"); volume.motion.pose = volume.flight.sample.book; volume.motion.openness = 0; }
    books.set(id, volume);
  }
}
