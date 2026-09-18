"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryControlsHandle } from "../GalleryControls";
import Loupe from "../loupe/Loupe";
import Director from "./Director";
import { useStageSelector, useStageStore } from "./StageProvider";
import type { StageHandlers, StageStore } from "./stageStore";

/** Every callback a scene can fire, each one fixed for the life of the store. */
type SceneCallbacks = Required<StageHandlers>;

/**
 * The scenes' callbacks, made once per store: they report what the stage must know and pass everything on to the
 * handlers the current page registered, looked up at call time (render-loop callbacks never hold a page's closure).
 */
function forwardTo(store: StageStore): SceneCallbacks {
  const page = () => store.handlers.current;
  return {
    onHoverBook: (book) => page().onHoverBook?.(book),
    onClickBook: (book) => page().onClickBook?.(book),
    onHoverShelf: (wall, shelf) => page().onHoverShelf?.(wall, shelf),
    onClickShelf: (wall, shelf) => page().onClickShelf?.(wall, shelf),
    onFacingSide: (side) => page().onFacingSide?.(side),
    onPlace: (place) => {
      // The store knows the gallery before the page rewrites the address to it.
      store.patch({ place });
      page().onPlace?.(place);
    },
    onLockChange: (locked) => {
      store.patch({ locked });
      page().onLockChange?.(locked);
    },
    onInteract: () => page().onInteract?.(),
    onHoverIndexPage: (pageNumber) => page().onHoverIndexPage?.(pageNumber),
    onClickIndexPage: (pageNumber) => page().onClickIndexPage?.(pageNumber),
    onHoverTurn: (which) => page().onHoverTurn?.(which),
    onTurn: (direction) => page().onTurn?.(direction),
  };
}

/**
 * Everything the stage keeps on the canvas for the pages: the one world and the book on its desk, placed by the
 * director, and the loupe, in hand only while a book is read.
 */
export default function StageScene() {
  const store = useStageStore();
  const loupe = useStageSelector((s) => s.desk?.loupe ?? false);
  const controlsRef = useRef<GalleryControlsHandle>(null);
  // Fixed functions: the memoised world must not re-render when a page hands in new handlers.
  const on = useMemo(() => forwardTo(store), [store]);
  const [reading, setReading] = useState(false);

  // Development aid: the store from the console (window.__stage.store), and the visitor moved as before (window.__gallery.current.teleport(...)).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __stage?: object; __gallery?: unknown };
    w.__stage = { ...w.__stage, store };
    w.__gallery = controlsRef;
  }, [store]);

  return (
    <>
      <Director controlsRef={controlsRef} on={on} onReading={setReading} />
      <Loupe active={loupe && reading} />
    </>
  );
}
