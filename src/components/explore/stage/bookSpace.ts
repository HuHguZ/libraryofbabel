import * as THREE from "three";
import { LIBRARY } from "@/lib/library";
import { PAGE } from "../bookPages";

/*
 * The reader's book space: the spine runs along z at x = 0, the reader sits at +z, the tops of the pages
 * face -z and the cover lies on y = 0. deskFrame.ts maps it into the world.
 */

export const COVER_TOP = 0.05;
export const GUTTER = 0.035;
/** Heights above the page block: the open page, the ribbon on it, the pages being turned (over both). */
export const PAGE_LIFT = 0.001;
export const RIBBON_LIFT = 0.002;
export const FLIP_LIFT = 0.0035;
/** The view of the whole book on the table, where the reader starts. */
export const HOME_POSITION = new THREE.Vector3(0.2, 2.25, 2.05);
export const HOME_TARGET = new THREE.Vector3(0, 0.16, 0.1);
/** Where the view may wander: the point looked at stays over the book. */
export const VIEW_BOUNDS = { x: PAGE.w + GUTTER - 0.05, z: PAGE.d / 2 - 0.02, yMin: 0.05, yMax: 0.26 };
/** Zoomed out past the starting view, the view drifts back over the whole book. */
export const OVERVIEW_DISTANCE = { from: HOME_POSITION.distanceTo(HOME_TARGET) + 0.25, to: 4.2 };
export const MIN_DISTANCE = 0.32;
export const MAX_DISTANCE = 4.2;

/** The open cover board, both halves, and the spine over the gutter. */
export const COVER = { w: 3.02, d: 2.14 } as const;
export const SPINE = { w: 0.07, h: 0.13, d: 2.1 } as const;
export const READER_FOV = 44;
export const READER_NEAR = 0.02;

/** A closed book lies over x ∈ [0, COVER.w / 2]: both cover halves and both page blocks (always 0.135 together). */
export const CLOSED_THICKNESS = 2 * COVER_TOP + 0.135;
export const CLOSED_CENTER = new THREE.Vector3(COVER.w / 4, CLOSED_THICKNESS / 2, 0);

/** Thickness of the page blocks left and right of the gutter once `turned` leaves lie on the left. */
export function blockHeights(turned: number): { left: number; right: number } {
  const read = Math.min(1, (2 * turned) / LIBRARY.pages);
  return { left: 0.015 + 0.105 * read, right: 0.015 + 0.105 * (1 - read) };
}
