import { LIBRARY } from "@/lib/library";
import type { View, Note, SharedPlace } from "@/lib/online/protocol";
import { addressOf, parseCellKey, type Cell } from "@/lib/world";

/** The walk in a gallery, facing a wall (1 for a doorway). The director builds the world there behind its veil. */
export function placeHref(cell: Cell, wall = 1): string {
  return `/explore/wall/${wall >= 1 && wall <= LIBRARY.walls ? wall : 1}?hex=${addressOf(cell)}`;
}

/** Where someone's view is: their book at their page, the volume's index, their shelf, or their gallery. */
export function viewHref(cell: Cell, view: View): string {
  const hex = addressOf(cell);
  if (view.kind === "desk") {
    return view.page ? `/page/${hex}-${view.wall}-${view.shelf}-${view.volume}-${view.page}` : `/explore/wall/${view.wall}/shelf/${view.shelf}/volume/${view.volume}?hex=${hex}`;
  }
  if (view.kind === "shelf") return `/explore/wall/${view.wall}/shelf/${view.shelf}?hex=${hex}`;
  return placeHref(cell, view.wall);
}
/** A place someone shared: their view there, and the fragment they marked (which names its own page). */
export function sharedPlaceHref(place: SharedPlace): string {
  const cell = parseCellKey(place.cell)!;
  const { fragment } = place;
  if (place.view.kind === "desk" && fragment) {
    return `/page/${addressOf(cell)}-${place.view.wall}-${place.view.shelf}-${place.view.volume}-${fragment.page}?text=${fragment.page}:${fragment.start}-${fragment.end}`;
  }
  return viewHref(cell, place.view);
}
export function noteHref(note: Note): string {
  const cell = parseCellKey(note.cell)!;
  const a = note.anchor;
  return a ? `/page/${addressOf(cell)}-${a.wall}-${a.shelf}-${a.volume}-${a.page}?text=${a.page}:${a.start}-${a.end}` : placeHref(cell);
}
