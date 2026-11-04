import type { Player } from "@/lib/online/protocol";
import { ROW } from "@/components/explore/geometry";
import type { Cell } from "@/lib/world";
import type { OnlineStore } from "./onlineStore";
import { pointOf, type MapView } from "./mapView";

export interface MapReader { player: Player; cell: Cell; along: number }
export interface ReaderGroup { x: number; y: number; readers: MapReader[] }
export const GROUP_RADIUS = 14;
const GROUP_DISTANCE = GROUP_RADIUS * 2;

/** A reader's position along a gallery, with its middle at 0.5. */
export const alongOf = (p: [number, number, number]) => 0.5 + (p[0] * ROW.nx + p[2] * ROW.nz) / ROW.period;

export function currentReaders(online: OnlineStore): MapReader[] {
  const out: MapReader[] = [];
  for (const player of online.getSnapshot().players.values()) {
    const last = online.tracks.get(player.id)?.at(-1);
    if (last) out.push({ player: { ...player, view: last.view }, cell: last.cell, along: alongOf(last.p) });
  }
  return out;
}

/** Stable anchors, spaced apart on screen; the hash avoids comparing every pair in a crowd. */
export function groupReaders(readers: readonly MapReader[], view: MapView, w: number, h: number): ReaderGroup[] {
  const points = [];
  for (const reader of readers) {
    const [x, y] = pointOf(view, w, h, reader.cell, reader.along, 0.35);
    if (x < -GROUP_RADIUS || x > w + GROUP_RADIUS || y < -GROUP_RADIUS || y > h + GROUP_RADIUS) continue;
    points.push({ reader, x, y });
  }
  points.sort((a, b) => a.reader.player.id < b.reader.player.id ? -1 : a.reader.player.id > b.reader.player.id ? 1 : 0);
  const buckets = new Map<string, ReaderGroup[]>();
  const groups: ReaderGroup[] = [];
  for (const { reader, x, y } of points) {
    const bx = Math.floor(x / GROUP_DISTANCE);
    const by = Math.floor(y / GROUP_DISTANCE);
    let nearest: ReaderGroup | undefined;
    let distance = GROUP_DISTANCE ** 2;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const group of buckets.get(`${bx + dx}:${by + dy}`) ?? []) {
        const d = (group.x - x) ** 2 + (group.y - y) ** 2;
        if (d < distance) { nearest = group; distance = d; }
      }
    }
    if (nearest) nearest.readers.push(reader);
    else {
      const group = { x, y, readers: [reader] };
      groups.push(group);
      const key = `${bx}:${by}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(group);
      else buckets.set(key, [group]);
    }
  }
  return groups;
}

export function pickReaderGroup(groups: readonly ReaderGroup[], x: number, y: number): ReaderGroup | undefined {
  return groups.find((group) => Math.hypot(group.x - x, group.y - y) <= (group.readers.length > 1 ? GROUP_RADIUS : 9));
}
