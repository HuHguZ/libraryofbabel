import { describe, expect, it, vi } from "vitest";
import { createStageStore, sameView, type DeskInputs } from "./stageStore";

const desk = (over: Partial<DeskInputs> = {}): DeskInputs => ({ title: "t", spread: 0, contents: {}, query: "", loupe: false, ...over });

describe("createStageStore", () => {
  it("starts empty", () => {
    expect(createStageStore().getSnapshot()).toEqual({
      view: null, shelfTitles: null, desk: null, place: null, ready: false, moving: false, locked: false, origin: null,
    });
  });

  it("emits once per real change of the view", () => {
    const store = createStageStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setView({ kind: "walk", hex: "babel", wall: 3 });
    store.setView({ kind: "walk", hex: "babel", wall: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    store.setView({ kind: "walk", hex: "babel", wall: 4 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the snapshot object when a patch changes nothing", () => {
    const store = createStageStore();
    const before = store.getSnapshot();
    store.patch({ ready: false, origin: null });
    expect(store.getSnapshot()).toBe(before);
    store.patch({ ready: true });
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().ready).toBe(true);
  });

  it("compares places and origins by value", () => {
    const store = createStageStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.patch({ place: { level: 1, side: "b", hex: "x" }, origin: { kind: "shelf", wall: 2, shelf: 5 } });
    store.patch({ place: { level: 1, side: "b", hex: "x" }, origin: { kind: "shelf", wall: 2, shelf: 5 } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("compares desk contents by reference and matches by value", () => {
    const store = createStageStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const contents = { 1: "abc" };
    store.setDesk(desk({ contents, currentMatch: { page: 1, start: 2 } }));
    store.setDesk(desk({ contents, currentMatch: { page: 1, start: 2 } }));
    expect(listener).toHaveBeenCalledTimes(1);
    store.setDesk(desk({ contents: { 1: "abc" }, currentMatch: { page: 1, start: 2 } }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createStageStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.patch({ moving: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps handlers and commands outside the snapshot", () => {
    const store = createStageStore();
    const before = store.getSnapshot();
    store.handlers.current = { onTurn: () => {} };
    store.commands.skip = () => {};
    expect(store.getSnapshot()).toBe(before);
  });
});

describe("sameView", () => {
  it("compares desk views deeply", () => {
    const book = { hex: "babel", wall: 2, shelf: 3, volume: 7 };
    expect(sameView({ kind: "desk", book, mode: "read" }, { kind: "desk", book: { ...book }, mode: "read" })).toBe(true);
    expect(sameView({ kind: "desk", book, mode: "read" }, { kind: "desk", book, mode: "index" })).toBe(false);
    expect(sameView({ kind: "shelf", hex: "babel", wall: 2, shelf: 3 }, { kind: "walk", hex: "babel", wall: 2 })).toBe(false);
  });
});
