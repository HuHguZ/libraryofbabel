import { addressOf, cellOf, offsetCell, type Cell } from "@/lib/world";

/** The galleries of a world built around one address: where that address stands, and the address of any gallery near it. */
export interface WorldAddresses {
  anchor: Cell;
  /** Address of the gallery `col` along the row and `level` floors up from the anchor. */
  hexAt(col: number, level: number): string;
}

/**
 * An address takes a few milliseconds to work out, so each is worked out once per world.
 * shortcut: the cache grows by one ~5 KB string per gallery visited; a reload clears it.
 */
export function worldAddresses(worldHex: string): WorldAddresses {
  const anchor = cellOf(worldHex);
  const known = new Map<string, string>([["0:0", worldHex]]);
  return {
    anchor,
    hexAt(col, level) {
      const key = `${col}:${level}`;
      let hex = known.get(key);
      if (hex === undefined) {
        hex = addressOf(offsetCell(anchor, col, level));
        known.set(key, hex);
      }
      return hex;
    },
  };
}
