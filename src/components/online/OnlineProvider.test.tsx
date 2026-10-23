import { useEffect } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineProvider, useOnlineStore } from "./OnlineProvider";
import type { OnlineStore } from "./onlineStore";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor() { Socket.instances.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
function Probe({ capture }: { capture: (store: OnlineStore) => void }) {
  const store = useOnlineStore();
  useEffect(() => { capture(store); }, [store, capture]);
  return null;
}
const welcome = { type: "welcome", you: { id: "me", nick: "Reader", color: "#b02e3a" }, last: null, admin: false };
beforeEach(() => {
  vi.useFakeTimers(); Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("online connection", () => {
  it("rewatches automatically after a dropped connection without blocking solo play", async () => {
    let store!: OnlineStore;
    const { unmount } = render(<OnlineProvider><Probe capture={(value) => { store = value; }} /></OnlineProvider>);
    await act(async () => {});
    const first = Socket.instances[0];
    act(() => { first.open(); first.receive(welcome); });
    expect(first.sent[0]).toEqual({ type: "hello", lang: "en" });
    store.watch(["0:0"]);
    act(() => first.close());
    expect(store.getSnapshot().status).toBe("offline");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    const second = Socket.instances[1];
    act(() => { second.open(); second.receive(welcome); });
    expect(second.sent).toContainEqual({ type: "watch", chunks: ["0:0"] });
    expect(store.getSnapshot().status).toBe("online");
    expect(() => second.onmessage?.({ data: "{" })).not.toThrow();
    unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Socket.instances).toHaveLength(2);
  });
  it("paces large watch views below the server rate and limits every frame to 64 keys", async () => {
    let store!: OnlineStore;
    const { unmount } = render(<OnlineProvider><Probe capture={(value) => { store = value; }} /></OnlineProvider>);
    await act(async () => {});
    const socket = Socket.instances[0];
    act(() => { socket.open(); socket.receive(welcome); });
    store.watch(Array.from({ length: 160 }, (_, i) => `${i}:0`));
    const watchLengths = () => socket.sent.filter((m) => (m as { type: string }).type === "watch").map((m) => (m as { chunks: string[] }).chunks.length);
    expect(watchLengths()).toEqual([64]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(watchLengths()).toEqual([64, 64]);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(watchLengths()).toEqual([64, 64, 32]);
    act(() => socket.receive({ ...welcome, you: { ...welcome.you, nick: "New name" } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(watchLengths()).toEqual([64, 64, 32]);
    expect(store.getSnapshot().you?.nick).toBe("New name");
    unmount();
  });
  it("falls offline when the guest endpoint is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    let store!: OnlineStore;
    const { unmount } = render(<OnlineProvider><Probe capture={(value) => { store = value; }} /></OnlineProvider>);
    await act(async () => {});
    expect(store.getSnapshot().status).toBe("offline");
    expect(Socket.instances).toHaveLength(0);
    unmount();
  });
});
