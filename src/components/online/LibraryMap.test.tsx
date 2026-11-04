import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@chakra-ui/react";
import { NextIntlClientProvider } from "next-intl";
import { StageProvider, useStageStore } from "@/components/explore/stage/StageProvider";
import type { StageStore } from "@/components/explore/stage/stageStore";
import { system } from "@/lib/theme";
import type { Player } from "@/lib/online/protocol";
import { addressOf } from "@/lib/world";
import messages from "../../../messages/en.json";
import { createOnlineStore } from "./onlineStore";
import LibraryMap from "./LibraryMap";

let online = createOnlineStore();
const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./OnlineProvider", () => ({ useOnlineStore: () => online }));

const ctx = {
  setTransform: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn<(x: number, y: number, radius: number, startAngle: number, endAngle: number) => void>(), fill: vi.fn(), stroke: vi.fn(),
  moveTo: vi.fn(), lineTo: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
};
let nextFrame: FrameRequestCallback | undefined;
let stage: StageStore;
function StageProbe() {
  const store = useStageStore();
  useEffect(() => { stage = store; }, [store]);
  return null;
}
const frame = (now: number) => act(() => { const next = nextFrame; nextFrame = undefined; next?.(now); });
const player = (id: string): Player => ({ id, nick: `Reader ${id}`, color: "#c9a227", cell: "0:0", p: [0, 0, 0], yaw: 0, view: { kind: "desk", wall: 1, shelf: 2, volume: 3, page: 5 } });

function mount() {
  render(<NextIntlClientProvider locale="en" messages={{ ...messages, Map: { ...messages.Map, readers: "Readers: {count}", searchReaders: "Search by nickname", showMore: "Show more" } }}><ChakraProvider value={system}><StageProvider><StageProbe /><LibraryMap mode="full" /></StageProvider></ChakraProvider></NextIntlClientProvider>);
  const canvas = screen.getByRole("img") as HTMLCanvasElement;
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  canvas.setPointerCapture = vi.fn();
  frame(1000);
  return canvas;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  online = createOnlineStore();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { nextFrame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => { nextFrame = undefined; });
  vi.stubGlobal("PointerEvent", MouseEvent);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("crowded library map", () => {
  it("opens every member of a coincident group and navigates to their latest book only on request", () => {
    online.receive({ type: "players", list: [player("b"), player("a")] }, 0);
    const canvas = mount();
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: 300, pointerId: 1 });
    const group = screen.getByRole("region", { name: "Readers: 2" });
    expect(within(group).getAllByRole("listitem")).toHaveLength(2);
    expect(within(group).getByText("Reader a")).not.toBeNull();
    expect(within(group).getByText("Reader b")).not.toBeNull();
    act(() => {
      online.receive({ type: "players", list: [player("a"), player("b"), player("c")] }, 50);
      vi.advanceTimersByTime(100);
    });
    expect(within(group).getAllByRole("listitem")).toHaveLength(3);
    act(() => {
      online.receive({ type: "poses", list: [{ ...player("a"), cell: "2:3", view: { kind: "desk", wall: 2, shelf: 4, volume: 6, page: 19 } }] }, 100);
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText(/volume 6, p. 19/)).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(within(group).getAllByRole("button", { name: messages.Map.openBook })[0]);
    expect(push).toHaveBeenCalledExactlyOnceWith(`/page/${addressOf({ x: 2n, floor: 3n })}-2-4-6-19`);
  });

  it("draws one counted marker for hundreds of players and caps background redraws", () => {
    online.receive({ type: "players", list: Array.from({ length: 500 }, (_, i) => player(String(i))) }, 0);
    mount();
    expect(ctx.fillText).toHaveBeenCalledWith("500", expect.any(Number), expect.any(Number));
    const initial = ctx.setTransform.mock.calls.length;
    for (let now = 1016; now < 1100; now += 16) frame(now);
    expect(ctx.setTransform.mock.calls.length).toBe(initial);
    frame(1100);
    expect(ctx.setTransform.mock.calls.length).toBe(initial + 1);
  });

  it("pages a thousand readers and finds the last nickname without mounting the whole group", () => {
    online.receive({ type: "players", list: [
      ...Array.from({ length: 1000 }, (_, i) => player(String(i).padStart(4, "0"))),
      { ...player("other-a"), cell: "10:0" }, { ...player("other-b"), cell: "10:0" },
    ] }, 0);
    const canvas = mount();
    const pick = () => {
      fireEvent.pointerDown(canvas, { clientX: 400, clientY: 300 });
      fireEvent.pointerUp(canvas, { clientX: 400, clientY: 300 });
    };
    pick();
    const group = screen.getByRole("region", { name: "Readers: 1000" });
    expect(within(group).getAllByRole("listitem")).toHaveLength(50);
    expect(within(group).queryByText("Reader 0999")).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "Show more" }));
    expect(within(group).getAllByRole("listitem")).toHaveLength(100);
    const search = within(group).getByRole("searchbox", { name: "Search by nickname" });
    fireEvent.change(search, { target: { value: " READER 0999 " } });
    expect(within(group).getAllByRole("listitem")).toHaveLength(1);
    expect(within(group).getByText("Reader 0999")).not.toBeNull();
    expect(within(group).queryByRole("button", { name: "Show more" })).toBeNull();
    fireEvent.change(search, { target: { value: "" } });
    expect(within(group).getAllByRole("listitem")).toHaveLength(50);
    fireEvent.click(within(group).getByRole("button", { name: "Show more" }));
    fireEvent.change(search, { target: { value: "0999" } });
    fireEvent.click(within(group).getByRole("button", { name: messages.Map.close }));
    pick();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "0999" } });
    fireEvent.pointerDown(canvas, { clientX: 620, clientY: 300 });
    fireEvent.pointerUp(canvas, { clientX: 620, clientY: 300 });
    expect(screen.getByRole("region", { name: "Readers: 2" })).not.toBeNull();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    pick();
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
  });

  it("keeps the visitor's own ring outside a coincident group count", () => {
    online.receive({ type: "players", list: [player("a"), player("b")] }, 0);
    mount();
    act(() => stage.patch({ place: { level: 0, col: 0, hex: addressOf({ x: 0n, floor: 0n }), cell: { x: 0n, floor: 0n } } }));
    frame(1100);
    expect(ctx.arc.mock.calls.at(-1)?.[2]).toBeGreaterThan(14);
  });

  it("keeps note and empty-gallery picks separate from reader groups", () => {
    online.notes.set("0:0", [{ id: 7, cell: "0:0", text: "A note in this gallery", author: "other", nick: "Note author", color: "#c9a227", at: "", anchor: null }]);
    const canvas = mount();
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 296 });
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: 296 });
    expect(screen.getByText("A note in this gallery")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: messages.Map.goHere }));
    expect(push).toHaveBeenLastCalledWith(`/explore/wall/1?hex=${addressOf({ x: 0n, floor: 0n })}`);
    fireEvent.click(screen.getByRole("button", { name: messages.Map.close }));
    fireEvent.pointerDown(canvas, { clientX: 500, clientY: 300 });
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 300 });
    expect(screen.getByText("Gallery 5 · floor 0")).not.toBeNull();
    expect(screen.queryByText("A note in this gallery")).toBeNull();
  });

  it("redraws immediately while panning and zooming and picks the new map coordinate", () => {
    const canvas = mount();
    const initial = ctx.setTransform.mock.calls.length;
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 300 });
    fireEvent.pointerMove(canvas, { clientX: 444, clientY: 300 });
    fireEvent.pointerUp(canvas, { clientX: 444, clientY: 300 });
    frame(1016);
    expect(ctx.setTransform.mock.calls.length).toBe(initial + 1);
    expect(screen.queryByRole("region")).toBeNull();
    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: -500 });
    frame(1032);
    expect(ctx.setTransform.mock.calls.length).toBe(initial + 2);
    fireEvent.pointerDown(canvas, { clientX: 500, clientY: 300 });
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 300 });
    expect(screen.getByText("Gallery 0 · floor 0")).not.toBeNull();
  });
});
