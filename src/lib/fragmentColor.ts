import { useCallback, useSyncExternalStore } from "react";

/** The colour a marked fragment is washed in, until the reader picks another. */
export const DEFAULT_FRAGMENT_COLOR = "#b02e3a";
export const FRAGMENT_COLOR_KEY = "babel:fragment-color";
/** Ready-made colours offered next to the free picker; they all read well over parchment. */
export const FRAGMENT_SWATCHES = ["#b02e3a", "#d9722b", "#c9a227", "#4f9a5a", "#2e8f9e", "#3a6fc4", "#7b52c7", "#c24d9a"] as const;

/** How strongly the colour washes over the page: in the text panel, a live selection there, and on the 3D page. */
export const FRAGMENT_ALPHA = { panel: 0.26, selection: 0.3, book: 0.36 } as const;

const HEX = /^#([0-9a-f]{6})$/i;

/** A colour as "#rrggbb" in lower case, or null for anything else. */
export function parseHexColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return HEX.test(value) ? value.toLowerCase() : null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt((parseHexColor(hex) ?? DEFAULT_FRAGMENT_COLOR).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The colour as a translucent wash, for CSS and canvas alike. */
export function fragmentWash(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ── The chosen colour, kept in localStorage and shared by every component (and every tab) that shows it ── */

const listeners = new Set<() => void>();
let memory: string | null = null;

export function readFragmentColor(): string {
  if (memory) return memory;
  try {
    memory = parseHexColor(window.localStorage.getItem(FRAGMENT_COLOR_KEY));
  } catch {
    // Storage can be off (private mode, blocked site data): the default colour still works.
  }
  return memory ?? DEFAULT_FRAGMENT_COLOR;
}

export function writeFragmentColor(color: string) {
  const value = parseHexColor(color);
  if (!value || value === readFragmentColor()) return;
  memory = value;
  try {
    if (value === DEFAULT_FRAGMENT_COLOR) window.localStorage.removeItem(FRAGMENT_COLOR_KEY);
    else window.localStorage.setItem(FRAGMENT_COLOR_KEY, value);
  } catch {
    // Remembered for this visit only.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  // A colour picked in another tab.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== FRAGMENT_COLOR_KEY && e.key !== null) return;
    memory = null;
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** The fragment colour and a setter that remembers it. The server and the first render use the default colour. */
export function useFragmentColor(): [string, (color: string) => void] {
  const color = useSyncExternalStore(subscribe, readFragmentColor, () => DEFAULT_FRAGMENT_COLOR);
  return [color, useCallback((next: string) => writeFragmentColor(next), [])];
}

/** Forgets the remembered colour in memory (tests start each case from storage). */
export function resetFragmentColorCache() {
  memory = null;
}
