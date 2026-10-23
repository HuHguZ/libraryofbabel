import { describe, expect, it, vi } from "vitest";
import { createOnlineStore } from "./onlineStore";
import { restoreSpawn } from "./spawn";
import { addressOf } from "@/lib/world";

describe("returning spawn", () => {
  it("restores a welcome before the deadline and ignores later welcomes", () => {
    vi.useFakeTimers();
    const store = createOnlineStore();
    const go = vi.fn();
    const stop = restoreSpawn(store, 1, go);
    vi.advanceTimersByTime(1100);
    expect(go).not.toHaveBeenCalled();
    store.receive({ type: "welcome", you: { id: "me", nick: "me", color: "#b02e3a" }, last: { cell: "3:-4", wall: 2 }, admin: false });
    expect(go).toHaveBeenCalledWith(addressOf({ x: 3n, floor: -4n }), 2);
    vi.advanceTimersByTime(100);
    expect(go).toHaveBeenCalledTimes(1);
    stop(); vi.useRealTimers();
  });
  it("falls back within 1.2 seconds and cancels on unmount", () => {
    vi.useFakeTimers();
    const store = createOnlineStore(); const go = vi.fn();
    const stop = restoreSpawn(store, 3, go);
    vi.advanceTimersByTime(1200);
    expect(go).toHaveBeenCalledOnce();
    expect(go.mock.calls[0][1]).toBe(3);
    expect(typeof go.mock.calls[0][0]).toBe("string");
    stop();
    const cancelled = vi.fn();
    restoreSpawn(store, 1, cancelled)();
    vi.advanceTimersByTime(1200);
    expect(cancelled).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
