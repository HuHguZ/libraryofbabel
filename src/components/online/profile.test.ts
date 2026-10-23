import { afterEach, expect, it, vi } from "vitest";
import { RateLimits } from "@/server/limits";
import { createProfileQueue } from "./profile";
afterEach(() => vi.useRealTimers());

it("retains the final colour and combines nearby name edits within the real profile bucket", () => {
  vi.useFakeTimers();
  const limits = new RateLimits();
  const accepted: unknown[] = [];
  const queue = createProfileQueue((message) => {
    expect(limits.take("profile", "guest", "ip")).toBe(true);
    accepted.push(message);
    return true;
  });
  queue.edit({ color: "#111111" });
  vi.advanceTimersByTime(250);
  expect(accepted).toEqual([{ type: "profile", color: "#111111" }]);
  for (const color of ["#222222", "#333333", "#abcdef"]) {
    queue.edit({ color }); vi.advanceTimersByTime(50);
  }
  queue.edit({ nick: "Final reader" });
  vi.advanceTimersByTime(5100);
  expect(accepted).toEqual([{ type: "profile", color: "#111111" }, { type: "profile", color: "#abcdef", nick: "Final reader" }]);
  queue.dispose();
});
it("retains edits while disconnected and cancels on unmount", () => {
  vi.useFakeTimers(); let connected = false;
  const sent: unknown[] = [];
  const queue = createProfileQueue((message) => {
    if (!connected) return false;
    sent.push(message); return true;
  });
  queue.edit({ color: "#abcdef" }); vi.advanceTimersByTime(1000);
  expect(sent).toEqual([]);
  connected = true; vi.advanceTimersByTime(1000);
  expect(sent).toEqual([{ type: "profile", color: "#abcdef" }]);
  queue.edit({ nick: "Never sent" }); queue.dispose(); vi.advanceTimersByTime(10_000);
  expect(sent).toHaveLength(1);
});
