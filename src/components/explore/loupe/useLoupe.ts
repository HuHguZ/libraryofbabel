"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** L on any layout: the key code, or the letter when the code is empty (embedded browsers), Russian included. */
const isLoupeKey = (e: KeyboardEvent) => e.code === "KeyL" || (!e.code && ["l", "L", "д", "Д"].includes(e.key));

const typing = (e: KeyboardEvent) => {
  const el = e.target;
  return el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

/** Pressed over a 3D scene (its canvas), not over the page around it. */
const overScene = (e: Event) => e.target instanceof HTMLCanvasElement;

const MIDDLE = 1;
/** A press of the wheel that moves further than this is a drag (the scene's own), not a click. */
const CLICK_SLOP = 5;

/**
 * Whether the loupe is in hand, for a page that offers one (pair it with `<Loupe active />` in the scene).
 * L (unless `hotkey` is false) and a click of the mouse wheel over the scene (unless `middleClick` is false)
 * take it and put it away; Escape puts it away.
 */
export function useLoupe({ hotkey = true, middleClick = true }: { hotkey?: boolean; middleClick?: boolean } = {}) {
  const [active, setActive] = useState(false);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Presses can come faster than renders: each one flips what the last one left.
  const toggle = useCallback(() => {
    activeRef.current = !activeRef.current;
    setActive(activeRef.current);
  }, []);
  const close = useCallback(() => {
    activeRef.current = false;
    setActive(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.key === "Escape") {
        if (activeRef.current) close();
        return;
      }
      if (!hotkey || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e) || !isLoupeKey(e)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey, toggle, close]);

  useEffect(() => {
    if (!middleClick) return;
    let pressed: { x: number; y: number } | null = null;
    const onDown = (e: MouseEvent) => {
      if (e.button !== MIDDLE || !overScene(e)) return;
      pressed = { x: e.clientX, y: e.clientY };
    };
    // Over the scene the wheel button belongs to the loupe, not to the browser's autoscroll.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === MIDDLE && overScene(e)) e.preventDefault();
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== MIDDLE || !pressed) return;
      const moved = Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y);
      pressed = null;
      if (moved <= CLICK_SLOP && overScene(e)) toggle();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [middleClick, toggle]);

  return { active, toggle, close };
}
