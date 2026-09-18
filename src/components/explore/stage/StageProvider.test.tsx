import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { useEffect } from "react";
import { StageProvider, useStageHandlers, useStageStore, useStageView } from "./StageProvider";
import type { StageStore, StageView } from "./stageStore";

function Probe({ view, onStore, handlers }: { view: StageView; onStore: (s: StageStore) => void; handlers: object }) {
  const store = useStageStore();
  useStageView(view);
  useStageHandlers(handlers);
  useEffect(() => {
    onStore(store);
  }, [store, onStore]);
  return null;
}

describe("StageProvider hooks", () => {
  it("publishes the view by value and clears only its own handlers", () => {
    let store: StageStore | null = null;
    const handlersA = { onTurn: () => {} };
    const { rerender, unmount } = render(
      <StageProvider>
        <Probe view={{ kind: "walk", hex: "babel", wall: 3 }} onStore={(s) => (store = s)} handlers={handlersA} />
      </StageProvider>
    );
    const first = store!.getSnapshot();
    expect(first.view).toEqual({ kind: "walk", hex: "babel", wall: 3 });
    rerender(
      <StageProvider>
        <Probe view={{ kind: "walk", hex: "babel", wall: 3 }} onStore={(s) => (store = s)} handlers={handlersA} />
      </StageProvider>
    );
    expect(store!.getSnapshot()).toBe(first);
    expect(store!.handlers.current).toBe(handlersA);
    unmount();
    expect(store!.handlers.current).toEqual({});
  });
});
