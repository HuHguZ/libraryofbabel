import { LIBRARY } from "@/lib/library";
import { createRandom } from "@/lib/hex";

/** Dimensions of one wall of shelves (metres). Local +z faces into the room, the back panel sits at z = 0. */
export const CASE = {
  width: 3.7,
  height: 3.36,
  depth: 0.32,
  shelfDepth: 0.3,
  shelfThickness: 0.035,
  usableWidth: 3.5,
  firstShelfY: 0.2,
  shelfGap: 0.44,
  bookW: 0.1,
  bookH: 0.32,
  bookD: 0.24,
} as const;

export interface BookRef {
  wall: number;
  shelf: number;
  volume: number;
}

/** Binding colours of one gallery: the volumes of a wall are drawn as one instanced mesh per colour. */
export const TINT_GROUPS = 8;

/** A volume on its shelf, in bookcase space: the centre of its box, its binding colour and its height jitter. */
export interface BookPlacement {
  shelf: number;
  volume: number;
  tint: number;
  x: number;
  y: number;
  z: number;
  scaleY: number;
}

interface TintGroup {
  tint: number;
  books: BookPlacement[];
}

/** Y of the plank of shelf `s` (1 = top, 7 = bottom). */
export function shelfPlankY(shelf: number): number {
  return CASE.firstShelfY + (LIBRARY.shelves - shelf) * CASE.shelfGap;
}

export function bookSpacing(): number {
  return CASE.usableWidth / LIBRARY.volumes;
}

/** Local position of a volume on its shelf. */
export function bookLocalPosition(shelf: number, volume: number, scaleY = 1): [number, number, number] {
  const spacing = bookSpacing();
  const x = -CASE.usableWidth / 2 + spacing * (volume - 1) + spacing / 2;
  const y = shelfPlankY(shelf) + CASE.shelfThickness / 2 + (CASE.bookH * scaleY) / 2;
  const z = 0.02 + CASE.bookD / 2;
  return [x, y, z];
}

/**
 * Deterministic binding colours and heights of the volumes of one wall; runs of the same tint read as
 * multi-volume series. `placements` holds every volume, shelf by shelf; `groups` (only the tints in use)
 * leave out `detailShelf`, whose volumes the close-up draws one by one.
 */
export function planBookcase(
  seed: number,
  wall: number,
  detailShelf?: number
): { groups: TintGroup[]; placements: BookPlacement[] } {
  const rand = createRandom(seed * 7919 + wall * 104729);
  const groups: TintGroup[] = Array.from({ length: TINT_GROUPS }, (_, tint) => ({ tint, books: [] }));
  const placements: BookPlacement[] = [];
  for (let shelf = 1; shelf <= LIBRARY.shelves; shelf++) {
    let tint = Math.floor(rand() * TINT_GROUPS);
    for (let volume = 1; volume <= LIBRARY.volumes; volume++) {
      if (rand() > 0.72) tint = Math.floor(rand() * TINT_GROUPS);
      const scaleY = 0.97 + rand() * 0.06;
      const [x, y, z] = bookLocalPosition(shelf, volume, scaleY);
      const placement = { shelf, volume, tint, x, y, z, scaleY };
      placements.push(placement);
      if (shelf !== detailShelf) groups[tint].books.push(placement);
    }
  }
  return { groups: groups.filter((g) => g.books.length > 0), placements };
}
