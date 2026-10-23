import { addressOf, parseCellKey, spawnHex } from "@/lib/world";
import type { OnlineStore } from "./onlineStore";

/** A welcome may restore the last gallery; a slow or unavailable server never delays solo entry past 1.2 s. */
export function restoreSpawn(online: OnlineStore, wall: number, go: (hex: string, wall: number) => void): () => void {
  let done = false;
  const finish = (hex: string, targetWall: number) => {
    if (done) return;
    done = true;
    go(hex, targetWall);
  };
  const decide = () => {
    const { status, you, last } = online.getSnapshot();
    const cell = last && parseCellKey(last.cell);
    if (you) finish(cell ? addressOf(cell) : spawnHex(), cell && last ? last.wall : wall);
    else if (status === "offline") finish(spawnHex(), wall);
  };
  const unsubscribe = online.subscribe(decide);
  decide();
  const timer = setTimeout(() => { if (!done) finish(spawnHex(), wall); }, 1200);
  return () => { done = true; unsubscribe(); clearTimeout(timer); };
}
