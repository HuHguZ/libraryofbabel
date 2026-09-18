"use client";

import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createStageStore, type DeskInputs, type StageHandlers, type StageSnapshot, type StageStore, type StageView } from "./stageStore";

const StageContext = createContext<StageStore | null>(null);

/** Creates one stage store per mount (the `(library)` layout renders exactly one) and provides it to the pages and the canvas below it. */
export function StageProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createStageStore());
  return <StageContext.Provider value={store}>{children}</StageContext.Provider>;
}

export function useStageStore(): StageStore {
  const store = useContext(StageContext);
  if (!store) throw new Error("useStageStore must be used inside <StageProvider>");
  return store;
}

/** Subscribes to the store; `select` must return a primitive or a reference already held by the snapshot. */
export function useStageSelector<T>(select: (snapshot: StageSnapshot) => T): T {
  const store = useStageStore();
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => select(store.getSnapshot())
  );
}

/** Publishes a page's view to the stage whenever it changes by value; the store's own equality decides. */
export function useStageView(view: StageView | null): void {
  const store = useStageStore();
  useLayoutEffect(() => {
    if (view) store.setView(view);
  }, [store, view]);
}

/** Publishes the desk inputs (title, spread, search, …) whenever they change by value. */
export function useStageDesk(inputs: DeskInputs | null): void {
  const store = useStageStore();
  useLayoutEffect(() => {
    if (inputs) store.setDesk(inputs);
  }, [store, inputs]);
}

/** Keeps the store's handlers pointed at this page's latest callbacks; on unmount hands them back to `{}`, unless another page already took over. */
export function useStageHandlers(handlers: StageHandlers): void {
  const store = useStageStore();
  useLayoutEffect(() => {
    store.handlers.current = handlers;
    return () => {
      if (store.handlers.current === handlers) {
        store.handlers.current = {};
      }
    };
  });
}
