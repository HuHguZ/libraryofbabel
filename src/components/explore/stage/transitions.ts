import type { BookAddress, StageView } from "./stageStore";

export type Controller =
  | { kind: "walk" }
  | { kind: "shelf"; wall: number; shelf: number }
  | { kind: "desk"; book: BookAddress; mode: "index" | "read" };

export type Transition =
  | { kind: "none" }
  | { kind: "build" } // no world yet
  | { kind: "rebuild" } // hex differs from place.hex
  | { kind: "glide"; to: "walk" | "shelf" } // walk↔shelf, shelf↔shelf
  | { kind: "take"; book: BookAddress; from: "walk" | "shelf" }
  | { kind: "return"; to: "walk" | "shelf" } // desk → walk/shelf
  | { kind: "mode"; mode: "index" | "read" } // same book
  | { kind: "swap"; book: BookAddress }; // desk → desk, other book

const sameBook = (a: BookAddress, b: BookAddress): boolean =>
  a.hex === b.hex && a.wall === b.wall && a.shelf === b.shelf && a.volume === b.volume;

/**
 * Pure decision: which transition to play (or none) as the requested view changes under a controller
 * already settled in the world at `placeHex`. No controller yet → build the world; a view whose hex
 * differs from the current gallery → rebuild it; otherwise the table from spec 5.1.
 */
export function decideTransition(controller: Controller | null, placeHex: string | null, view: StageView): Transition {
  if (controller === null) return { kind: "build" };

  const viewHex = view.kind === "desk" ? view.book.hex : view.hex;
  if (viewHex !== placeHex) return { kind: "rebuild" };

  if (controller.kind === "walk") {
    if (view.kind === "walk") return { kind: "none" };
    if (view.kind === "shelf") return { kind: "glide", to: "shelf" };
    return { kind: "take", book: view.book, from: "walk" };
  }

  if (controller.kind === "shelf") {
    if (view.kind === "walk") return { kind: "glide", to: "walk" };
    if (view.kind === "shelf") {
      const same = view.wall === controller.wall && view.shelf === controller.shelf;
      return same ? { kind: "none" } : { kind: "glide", to: "shelf" };
    }
    return { kind: "take", book: view.book, from: "shelf" };
  }

  // controller.kind === "desk"
  if (view.kind === "walk") return { kind: "return", to: "walk" };
  if (view.kind === "shelf") return { kind: "return", to: "shelf" };
  if (sameBook(view.book, controller.book)) {
    return view.mode === controller.mode ? { kind: "none" } : { kind: "mode", mode: view.mode };
  }
  return { kind: "swap", book: view.book };
}
