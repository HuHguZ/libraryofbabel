import { describe, expect, it, vi } from "vitest";
import { MAX_FRAME, type Player } from "@/lib/online/protocol";
import { createOnlineStore } from "./onlineStore";

const me = { id: "me", nick: "Я", color: "#b02e3a" };
const other = (id: string): Player => ({ id, nick: id, color: "#4f9a5a", cell: "1:2", p: [0, 1.6, 0], yaw: 0, view: { kind: "walk", wall: 1 } });

describe("onlineStore", () => {
  it("keeps early watches until welcome and restores them without a consumer rerender", () => {
    const store = createOnlineStore(); const sent: unknown[] = [];
    store.send = (message) => sent.push(message);
    store.watch(["0:0", "0:0"]);
    expect(sent).toEqual([]);
    const welcome = { type: "welcome" as const, you: me, last: null, admin: false };
    store.receive(welcome);
    expect(sent).toEqual([{ type: "watch", chunks: ["0:0"] }]);
    store.setStatus("offline"); store.receive(welcome);
    expect(sent).toHaveLength(2);
  });
  it("is online once welcomed, and knows who I am and where I was", () => {
    const store = createOnlineStore();
    store.receive({ type: "welcome", you: me, last: { cell: "3:4", wall: 2 }, admin: false });
    expect(store.getSnapshot()).toMatchObject({ status: "online", you: me, last: { cell: "3:4", wall: 2 } });
  });

  it("lists everyone but me", () => {
    const store = createOnlineStore();
    store.receive({ type: "welcome", you: me, last: null, admin: false });
    store.receive({ type: "players", list: [{ ...other("me") }, other("a"), other("b")] });
    expect([...store.getSnapshot().players.keys()]).toEqual(["a", "b"]);
    expect(store.tracks.get("a")).toHaveLength(1);
  });

  it("puts poses on tracks without telling React", () => {
    const store = createOnlineStore();
    store.receive({ type: "welcome", you: me, last: null, admin: false });
    store.receive({ type: "players", list: [other("a")] });
    const listener = vi.fn();
    store.subscribe(listener);
    store.receive({ type: "poses", list: [{ id: "a", cell: "1:2", p: [1, 1.6, 0], yaw: 1, view: { kind: "walk", wall: 1 } }] }, 500);
    expect(listener).not.toHaveBeenCalled();
    expect(store.tracks.get("a")!.at(-1)).toMatchObject({ t: 500, cell: { x: 1n, floor: 2n }, p: [1, 1.6, 0] });
  });
  it("publishes fragment changes and clearing while keeping loupe-only motion out of React", () => {
    const store = createOnlineStore();
    store.receive({ type: "welcome", you: me, last: null, admin: false });
    const player = { ...other("a"), view: { kind: "desk" as const, wall: 1, shelf: 2, volume: 3, page: 4 } };
    const fragment = { page: 4, start: 2, end: 8, color: "#abcdef" }, loupe = { page: 4, u: 0.2, v: 0.3, power: 3 };
    store.receive({ type: "players", list: [{ ...player, reading: { fragment, loupe } }] }, 0);
    const initial = store.getSnapshot().selectionsVersion;
    expect(initial).toBe(1);
    expect(store.tracks.get("a")!.at(-1)!.reading).toEqual({ fragment, loupe });
    const listener = vi.fn(); store.subscribe(listener);
    store.receive({ type: "poses", list: [{ ...player, reading: { fragment, loupe: { ...loupe, u: 0.4 } } }] }, 100);
    expect(store.tracks.get("a")!.at(-1)!.reading?.loupe?.u).toBe(0.4);
    expect(store.getSnapshot().selectionsVersion).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    store.receive({ type: "poses", list: [{ ...player, reading: { fragment: { ...fragment, end: 9 } } }] }, 200);
    expect(store.getSnapshot().selectionsVersion).toBe(initial + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    store.receive({ type: "poses", list: [player] }, 300);
    expect(store.tracks.get("a")!.at(-1)!.reading).toBeUndefined();
    expect(store.getSnapshot().selectionsVersion).toBe(initial + 2);
  });
  it("updates existing roster selections and clears them on removal and offline", () => {
    const store = createOnlineStore();
    store.receive({ type: "welcome", you: me, last: null, admin: false });
    const player = { ...other("a"), view: { kind: "desk" as const, wall: 1, shelf: 2, volume: 3, page: 4 } };
    const fragment = { page: 4, start: 2, end: 8, color: "#abcdef" };
    store.receive({ type: "players", list: [player] }, 0);
    store.receive({ type: "players", list: [{ ...player, reading: { fragment } }] }, 100);
    expect(store.tracks.get("a")!.at(-1)!.reading?.fragment).toEqual(fragment);
    expect(store.getSnapshot().selectionsVersion).toBe(1);
    store.receive({ type: "players", list: [] });
    expect(store.tracks.has("a")).toBe(false);
    expect(store.getSnapshot().selectionsVersion).toBe(2);
    store.receive({ type: "players", list: [{ ...player, reading: { fragment } }] });
    store.setStatus("offline");
    expect(store.tracks.size).toBe(0);
    expect(store.getSnapshot().selectionsVersion).toBe(4);
  });
  it("repaints selection context changes and explicit departure without reacting to loupe removal", () => {
    const store = createOnlineStore();
    store.receive({ type: "welcome", you: me, last: null, admin: false });
    const player = { ...other("a"), view: { kind: "desk" as const, wall: 1, shelf: 2, volume: 3, page: 4 }, reading: { fragment: { page: 4, start: 2, end: 8, color: "#abcdef" } } };
    store.receive({ type: "players", list: [player] });
    store.receive({ type: "poses", list: [{ ...player, view: { ...player.view, volume: 4 } }] });
    expect(store.getSnapshot().selectionsVersion).toBe(2);
    store.receive({ type: "left", id: "a" });
    expect(store.getSnapshot().selectionsVersion).toBe(3);
    store.receive({ type: "players", list: [{ ...player, reading: { loupe: { page: 4, u: 0.2, v: 0.3, power: 3 } } }] });
    store.setStatus("offline");
    expect(store.getSnapshot().selectionsVersion).toBe(3);
  });

  it("forgets who left, and everyone when the connection goes", () => {
    const store = createOnlineStore();
    store.receive({ type: "welcome", you: me, last: null, admin: false });
    store.receive({ type: "players", list: [other("a"), other("b")] });
    store.receive({ type: "left", id: "a" });
    expect([...store.getSnapshot().players.keys()]).toEqual(["b"]);
    expect(store.tracks.has("a")).toBe(false);
    store.setStatus("offline");
    expect(store.getSnapshot().players.size).toBe(0);
    expect(store.tracks.size).toBe(0);
  });
});
describe("chunks", () => {
  const welcome = { type: "welcome" as const, you: me, last: null, admin: false };
  it("keeps watches inside the frame limit even at astronomical coordinates", () => {
    const store = createOnlineStore(); const sent: unknown[] = [];
    store.send = (message) => sent.push(message);
    store.receive(welcome);
    const far = 10n ** 4000n;
    store.watch(Array.from({ length: 64 }, (_, i) => `${far + BigInt(i)}:${-far}`));
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.every((message) => new TextEncoder().encode(JSON.stringify(message)).length <= MAX_FRAME)).toBe(true);
    expect(sent.flatMap((message) => (message as { chunks: string[] }).chunks)).toHaveLength(64);
  });

  it("asks for each chunk once per connection, 64 at a time", () => {
    const store = createOnlineStore();
    const sent: unknown[] = [];
    store.send = (m) => sent.push(m);
    store.receive(welcome);
    store.watch(Array.from({ length: 70 }, (_, i) => `${i}:0`));
    store.watch(["0:0", "70:0"]);
    expect(sent.map((m) => (m as { chunks: string[] }).chunks.length)).toEqual([64, 6, 1]);
  });

  it("asks again after a reconnect", () => {
    const store = createOnlineStore();
    const sent: unknown[] = [];
    store.send = (m) => sent.push(m);
    store.receive(welcome);
    store.watch(["0:0"]);
    store.setStatus("offline");
    store.receive(welcome);
    store.watch(["0:0"]);
    expect(sent).toHaveLength(2);
  });

  it("keeps chunks and lights the bits that arrive later", () => {
    const store = createOnlineStore();
    store.receive(welcome);
    store.receive({ type: "chunk", key: "0:0", fog: btoa("\u0001" + "\u0000".repeat(127)), notes: [] });
    store.receive({ type: "fog", key: "0:0", bit: 9 });
    store.receive({ type: "fog", key: "7:7", bit: 1 });
    const bits = store.chunks.get("0:0")!;
    expect(bits[0]).toBe(1);
    expect(bits[1]).toBe(2);
    expect(store.chunks.has("7:7")).toBe(false);
  });
});
describe("notes and messages", () => {
  const welcome = { type: "welcome" as const, you: me, last: null, admin: false };
  const note = (id: number, cell: string) => ({ id, cell, anchor: null, text: `n${id}`, author: "a", nick: "a", color: "#b02e3a", at: "2026-10-04T00:00:00Z" });
  const message = (id: number) => ({ id, author: "a", nick: "a", color: "#b02e3a", text: `m${id}`, place: null, at: "2026-10-04T00:00:00Z" });

  it("keeps the notes of chunks, adds new ones and forgets taken-down ones", () => {
    const store = createOnlineStore();
    store.receive(welcome);
    store.receive({ type: "chunk", key: "0:0", fog: btoa("\u0000".repeat(128)), notes: [note(1, "3:4")] });
    const before = store.getSnapshot().notesVersion;
    store.receive({ type: "noted", note: note(2, "3:4") });
    store.receive({ type: "noted", note: note(3, "40:0") }); // a chunk not asked for: comes with it later
    expect(store.notesAt({ x: 3n, floor: 4n }).map((n) => n.id)).toEqual([2, 1]);
    expect(store.notes.has("1:0")).toBe(false);
    store.receive({ type: "forgotten", kind: "note", id: 1 });
    expect(store.notesAt({ x: 3n, floor: 4n }).map((n) => n.id)).toEqual([2]);
    expect(store.getSnapshot().notesVersion).toBeGreaterThan(before);
  });

  it("keeps the last 200 messages", () => {
    const store = createOnlineStore();
    store.receive(welcome);
    store.receive({ type: "history", messages: Array.from({ length: 200 }, (_, i) => message(i + 1)) });
    store.receive({ type: "message", message: message(201) });
    const { messages } = store.getSnapshot();
    expect(messages).toHaveLength(200);
    expect(messages[0].id).toBe(2);
    store.receive({ type: "forgotten", kind: "chat", id: 201 });
    expect(store.getSnapshot().messages.at(-1)!.id).toBe(200);
  });

  it("bounds presence and chat in one buffer without deleting presence as chat", () => {
    const store = createOnlineStore();
    store.receive(welcome);
    store.receive({ type: "history", messages: Array.from({ length: 200 }, (_, i) => message(i + 1)) });
    const activity = { id: "presence:201", action: "joined" as const, nick: "Reader", at: "2026-11-04T00:00:00Z" };
    store.receive({ type: "activity", activity });
    store.receive({ type: "message", message: message(201) });
    expect(store.getSnapshot().messages).toHaveLength(200);
    expect(store.getSnapshot().messages[0].id).toBe(3);
    store.receive({ type: "forgotten", kind: "chat", id: 201 });
    expect(store.getSnapshot().messages.at(-1)).toEqual(activity);
  });

  it("remembers the last refusal", () => {
    const store = createOnlineStore();
    store.receive({ type: "refused", reason: "rate" }, 1234);
    expect(store.getSnapshot().refused).toEqual({ reason: "rate", at: 1234 });
  });
});
