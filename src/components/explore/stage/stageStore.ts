import type { BookRef } from "../Bookcase";
import type { WorldPlace } from "../HexGalleryScene";

export interface BookAddress {
  hex: string;
  wall: number;
  shelf: number;
  volume: number;
}

export type StageView =
  | { kind: "walk"; hex: string; wall: number }
  | { kind: "shelf"; hex: string; wall: number; shelf: number }
  | { kind: "desk"; book: BookAddress; mode: "index" | "read" };

/** What the volume and reader pages feed the book on the desk. */
export interface DeskInputs {
  title: string;
  spread: number; // 0 in index mode
  contents: Record<number, string>;
  query: string;
  focusToken?: string;
  currentMatch?: { page: number; start: number } | null;
  matchStep?: number;
  mark?: { page: number; start: number; end: number } | null;
  markColor?: string;
  markFocusToken?: string;
  loupe: boolean;
}

export interface StageHandlers {
  onHoverBook?(book: BookRef | null): void;
  onClickBook?(book: BookRef): void;
  onHoverShelf?(wall: number, shelf: number | null): void;
  onClickShelf?(wall: number, shelf: number): void;
  onFacingSide?(side: number): void;
  onPlace?(place: WorldPlace): void;
  onLockChange?(locked: boolean): void;
  onInteract?(): void;
  onHoverIndexPage?(page: number | null): void;
  onClickIndexPage?(page: number): void;
  onHoverTurn?(which: "prev" | "next" | null): void;
  onTurn?(direction: 1 | -1): void;
}

export interface StageSnapshot {
  view: StageView | null; // requested by the current page
  shelfTitles: { hex: string; wall: number; shelf: number; titles: string[] } | null;
  desk: DeskInputs | null; // last inputs; never cleared on page unmount
  place: WorldPlace | null; // gallery the visitor is in (reported by the stage)
  ready: boolean; // current world visible (veil gone)
  moving: boolean; // a transition is playing
  locked: boolean; // mouse captured in walk mode
  origin: { kind: "walk" } | { kind: "shelf"; wall: number; shelf: number } | null; // where the desk book came from
}

export interface StageCommands {
  lookAt?(yaw: number, pitch?: number): void;
  skip?(): void;
}

export interface StageStore {
  getSnapshot(): StageSnapshot;
  subscribe(listener: () => void): () => void;
  setView(view: StageView): void; // no-op (no emit) when deep-equal to the current view
  setShelfTitles(v: StageSnapshot["shelfTitles"]): void;
  setDesk(inputs: DeskInputs): void;
  patch(partial: Partial<Pick<StageSnapshot, "place" | "ready" | "moving" | "locked" | "origin">>): void; // stage-side reports; no emit when nothing changed
  handlers: { current: StageHandlers }; // latest handlers of the active page (not part of the snapshot)
  commands: StageCommands; // registered by the stage
}

const sameBookAddress = (a: BookAddress, b: BookAddress): boolean =>
  a.hex === b.hex && a.wall === b.wall && a.shelf === b.shelf && a.volume === b.volume;

/** Deep, by-value equality of two stage views (a desk view's book compared by address, not reference). */
export function sameView(a: StageView | null, b: StageView | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "walk") return b.kind === "walk" && a.hex === b.hex && a.wall === b.wall;
  if (a.kind === "shelf") return b.kind === "shelf" && a.hex === b.hex && a.wall === b.wall && a.shelf === b.shelf;
  return b.kind === "desk" && a.mode === b.mode && sameBookAddress(a.book, b.book);
}

const samePlace = (a: WorldPlace | null, b: WorldPlace | null): boolean =>
  a === b || (a !== null && b !== null && a.level === b.level && a.side === b.side && a.hex === b.hex);

const sameOrigin = (a: StageSnapshot["origin"], b: StageSnapshot["origin"]): boolean => {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "walk") return true;
  return a.kind === "shelf" && b.kind === "shelf" && a.wall === b.wall && a.shelf === b.shelf;
};

type Match = { page: number; start: number };
type Mark = { page: number; start: number; end: number };

const sameMatch = (a?: Match | null, b?: Match | null): boolean => {
  const x = a ?? null;
  const y = b ?? null;
  return x === y || (x !== null && y !== null && x.page === y.page && x.start === y.start);
};

const sameMark = (a?: Mark | null, b?: Mark | null): boolean => {
  const x = a ?? null;
  const y = b ?? null;
  return x === y || (x !== null && y !== null && x.page === y.page && x.start === y.start && x.end === y.end);
};

/** `contents` by reference (replaced wholesale, never mutated in place); `currentMatch`/`mark` by value; the rest with `Object.is`. */
const sameDesk = (a: DeskInputs | null, b: DeskInputs): boolean =>
  a !== null &&
  a.contents === b.contents &&
  sameMatch(a.currentMatch, b.currentMatch) &&
  sameMark(a.mark, b.mark) &&
  Object.is(a.title, b.title) &&
  Object.is(a.spread, b.spread) &&
  Object.is(a.query, b.query) &&
  Object.is(a.focusToken, b.focusToken) &&
  Object.is(a.matchStep, b.matchStep) &&
  Object.is(a.markColor, b.markColor) &&
  Object.is(a.markFocusToken, b.markFocusToken) &&
  Object.is(a.loupe, b.loupe);

const sameShelfTitles = (a: StageSnapshot["shelfTitles"], b: StageSnapshot["shelfTitles"]): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.hex === b.hex &&
    a.wall === b.wall &&
    a.shelf === b.shelf &&
    a.titles.length === b.titles.length &&
    a.titles.every((title, i) => title === b.titles[i]));

/**
 * The stage's single source of truth. Pages publish a view and desk inputs into it; the stage reports
 * place/ready/moving/locked back; handlers and commands are kept out of the snapshot so wiring them up
 * never triggers a re-render on their own. Snapshots are immutable and replaced wholesale on real change,
 * so `useSyncExternalStore` selectors can return stored references.
 */
export function createStageStore(): StageStore {
  let snapshot: StageSnapshot = {
    view: null,
    shelfTitles: null,
    desk: null,
    place: null,
    ready: false,
    moving: false,
    locked: false,
    origin: null,
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setView(view) {
      if (sameView(snapshot.view, view)) return;
      snapshot = { ...snapshot, view };
      emit();
    },

    setShelfTitles(v) {
      if (sameShelfTitles(snapshot.shelfTitles, v)) return;
      snapshot = { ...snapshot, shelfTitles: v };
      emit();
    },

    setDesk(inputs) {
      if (sameDesk(snapshot.desk, inputs)) return;
      snapshot = { ...snapshot, desk: inputs };
      emit();
    },

    patch(partial) {
      let changed = false;
      const next: StageSnapshot = { ...snapshot };

      if ("place" in partial) {
        const value = partial.place ?? null;
        if (!samePlace(snapshot.place, value)) {
          next.place = value;
          changed = true;
        }
      }
      if ("origin" in partial) {
        const value = partial.origin ?? null;
        if (!sameOrigin(snapshot.origin, value)) {
          next.origin = value;
          changed = true;
        }
      }
      if ("ready" in partial && partial.ready !== undefined && !Object.is(snapshot.ready, partial.ready)) {
        next.ready = partial.ready;
        changed = true;
      }
      if ("moving" in partial && partial.moving !== undefined && !Object.is(snapshot.moving, partial.moving)) {
        next.moving = partial.moving;
        changed = true;
      }
      if ("locked" in partial && partial.locked !== undefined && !Object.is(snapshot.locked, partial.locked)) {
        next.locked = partial.locked;
        changed = true;
      }

      if (changed) {
        snapshot = next;
        emit();
      }
    },

    handlers: { current: {} },
    commands: {},
  };
}
