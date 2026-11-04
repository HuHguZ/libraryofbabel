// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@/lib/online/protocol";
import { OnlineHub, type Storage } from "./session";
import { createOnlineStore } from "@/components/online/onlineStore";
const pose = { type: "pose", cell: "0:0", p: [0, 1.6, 0], yaw: 0, view: { kind: "walk", wall: 1 } };
it("protects saved mark colours and deletion from other readers and admins, and shares the stored anchor", async () => {
  const anchor = { wall: 1, shelf: 2, volume: 3, page: 4, start: 10, end: 30 };
  const mark = { id: 42, cell: "0:0", anchor, text: "", author: "author", nick: "Author", color: "#b02e3a", highlightColor: "#3a6fc4", at: "2026-11-04T00:00:00Z" };
  let forgotten = false;
  const hub = new OnlineHub(storage({
    addNote: async () => ({ id: mark.id, at: mark.at }),
    noteById: async (lang, id) => lang === "ru" && id === 42 ? mark : null,
    paintNote: async (lang, id, author, color) => { if (lang !== "ru" || id !== 42 || author !== mark.author) return false; mark.highlightColor = color; return true; },
    authorOf: async () => mark.author, forget: async () => { forgotten = true; return true; },
  }), "token");
  const a = tab(hub, "author"), b = tab(hub, "other"), admin = tab(hub, "admin");
  await a.receive({ type: "hello", lang: "ru" }); await b.receive({ type: "hello", lang: "ru" }); await admin.receive({ type: "hello", lang: "ru", admin: "token" });
  await a.receive({ type: "note", cell: "0:0", anchor, text: "", highlightColor: mark.highlightColor });
  expect(b.messages.at(-1)).toMatchObject({ type: "noted", note: { highlightColor: "#3a6fc4" } });
  await b.receive({ type: "paint", id: 42, color: "#abcdef" }); await admin.receive({ type: "paint", id: 42, color: "#abcdef" });
  expect(mark.highlightColor).toBe("#3a6fc4");
  await a.receive({ type: "paint", id: 42, color: "#4f9a5a" });
  expect(b.messages.at(-1)).toEqual({ type: "painted", id: 42, color: "#4f9a5a" });
  await b.receive({ type: "share-note", id: 42 });
  expect(a.messages.at(-1)).toMatchObject({ type: "message", message: { place: { note: 42, cell: "0:0", view: { kind: "desk", wall: 1, shelf: 2, volume: 3, page: 4 } } } });
  await admin.receive({ type: "forget", kind: "note", id: 42 }); expect(forgotten).toBe(false);
  await a.receive({ type: "forget", kind: "note", id: 42 }); expect(forgotten).toBe(true);
});
it("replays mark recolouring after a concurrent chunk snapshot", async () => {
  let release!: (value: Map<string, Uint8Array>) => void;
  const mark = { id: 42, cell: "0:0", anchor: { wall: 1, shelf: 2, volume: 3, page: 4, start: 10, end: 30 }, text: "", author: "other", nick: "Other", color: "#b02e3a", highlightColor: "#3a6fc4", at: "2026-11-04T00:00:00Z" };
  const hub = new OnlineHub(storage({ notesIn: async () => new Map([["0:0", [mark]]]), loadFog: () => new Promise(done => { release = done; }) }), "");
  const store = createOnlineStore(), a = hub.connect("a", "a", message => store.receive(message), () => {});
  await a.receive(JSON.stringify({ type: "hello", lang: "ru" }));
  const watch = a.receive(JSON.stringify({ type: "watch", chunks: ["0:0"] }));
  await new Promise(done => setImmediate(done));
  hub.broadcast("ru", { type: "painted", id: 42, color: "#4f9a5a" }); release(new Map()); await watch;
  expect(store.notesAt({ x: 0n, floor: 0n })[0].highlightColor).toBe("#4f9a5a");
});
function storage(overrides: Partial<Storage> = {}): Storage {
  return {
    loadGuest: async () => ({ nick: "Reader", color: "#b02e3a" }), lastPlace: async () => null,
    saveProfile: async () => {}, savePlace: async () => {}, loadFog: async () => new Map(), addFog: async () => {},
    notesIn: async () => new Map(), recentMessages: async () => [], addMessage: async () => ({ id: 1, at: "2026-10-04T00:00:00Z" }),
    addNote: async () => ({ id: 1, at: "2026-10-04T00:00:00Z" }), authorOf: async () => null,
    forget: async () => false, addBan: async () => {}, noteById: async () => null, paintNote: async () => false, ...overrides,
  };
}
function tab(hub: OnlineHub, guest: string, ip = guest) {
  const messages: ServerMessage[] = [], closes: number[] = [];
  const client = hub.connect(guest, ip, message => messages.push(message), code => closes.push(code));
  return { client, messages, closes, receive: (value: unknown) => client.receive(JSON.stringify(value)) };
}
describe("online sessions", () => {
  it("requires hello first and never resurrects a tab closed during hello", async () => {
    const hub = new OnlineHub(storage(), "admin");
    const early = tab(hub, "early"); await early.receive(pose); expect(early.closes).toEqual([4002]);
    let resolve!: (value: { nick: string; color: string }) => void;
    const slow = new OnlineHub(storage({ loadGuest: () => new Promise(done => { resolve = done; }) }), "admin");
    const gone = tab(slow, "gone"); const hello = gone.receive({ type: "hello", lang: "ru" });
    await Promise.resolve(); gone.client.close(); resolve({ nick: "Reader", color: "#b02e3a" }); await hello;
    expect(gone.messages).toEqual([]); expect(slow.worlds.get("ru")?.players.size).toBe(0);
  });
  it("serialises duplicate hellos, isolates worlds and keeps a second tab joined", async () => {
    const hub = new OnlineHub(storage(), "admin");
    const a = tab(hub, "a"), second = tab(hub, "a"), en = tab(hub, "en");
    await Promise.all([a.receive({ type: "hello", lang: "ru" }), a.receive({ type: "hello", lang: "en" }), second.receive({ type: "hello", lang: "ru" }), en.receive({ type: "hello", lang: "en" })]);
    await a.receive(pose); await second.receive(pose); await en.receive(pose);
    expect(a.messages.filter(message => message.type === "welcome")).toHaveLength(1);
    a.client.close(); expect(hub.worlds.get("ru")?.players.has("a")).toBe(true);
    second.client.close(); expect(hub.worlds.get("ru")?.players.size).toBe(0);
    expect(en.messages.some(message => message.type === "left")).toBe(false);
  });
  it("limits guest and IP writes and refuses bad text without losing the connection", async () => {
    const hub = new OnlineHub(storage(), "admin"); const a = tab(hub, "a", "shared"), b = tab(hub, "b", "shared");
    await a.receive({ type: "hello", lang: "ru" }); await b.receive({ type: "hello", lang: "en" });
    for (let i = 0; i < 5; i++) await a.receive({ type: "chat", text: "hi" });
    await b.receive({ type: "chat", text: "hi" });
    expect(b.messages.at(-1)).toEqual({ type: "refused", reason: "rate" });
    await a.receive({ type: "chat", text: " " }); expect(a.messages.at(-1)).toEqual({ type: "refused", reason: "length" });
  });
  it("scopes moderation to the connection's world and closes every banned IP", async () => {
    let removed = false;
    const hub = new OnlineHub(storage({ authorOf: async lang => lang === "ru" ? "author" : null, forget: async () => { removed = true; return true; } }), "token");
    const author = tab(hub, "author", "shared"), foreign = tab(hub, "foreign"), admin = tab(hub, "admin"), bystander = tab(hub, "bystander", "shared");
    await author.receive({ type: "hello", lang: "ru" }); await foreign.receive({ type: "hello", lang: "en", admin: "token" });
    await admin.receive({ type: "hello", lang: "ru", admin: "token" }); await bystander.receive({ type: "hello", lang: "en" });
    await foreign.receive({ type: "forget", kind: "note", id: 1 }); expect(removed).toBe(false);
    await author.receive({ type: "forget", kind: "note", id: 1 }); expect(removed).toBe(true);
    await admin.receive({ type: "ban", guest: "00000000-0000-0000-0000-000000000001" });
    // Valid wire ids are UUIDs; this target is disconnected and still becomes banned.
    expect(hub.bans.has("00000000-0000-0000-0000-000000000001", "")).toBe(true);
    hub.bans.add("author", "shared");
    await author.receive({ type: "profile", nick: "New reader" }); expect(author.messages.at(-1)).toEqual({ type: "refused", reason: "banned" });
  });
  it("retries a failed position write with the newest pose after a tab closes", async () => {
    let failing = true;
    const saved: string[] = [];
    const hub = new OnlineHub(storage({ savePlace: async (_id, _lang, cell) => { if (failing) throw new Error("offline"); saved.push(cell); } }), "");
    const a = tab(hub, "a"); await a.receive({ type: "hello", lang: "ru" }); await a.receive(pose);
    await expect(hub.flush()).rejects.toThrow();
    await a.receive({ ...pose, cell: "1:0" }); a.client.close(); failing = false; await hub.flush(); await hub.flush();
    expect(saved).toEqual(["1:0"]);
  });
  it("falls back offline when a database operation fails", async () => {
    const hub = new OnlineHub(storage({ addMessage: async () => { throw new Error("database unavailable"); } }), "");
    const a = tab(hub, "a"); await a.receive({ type: "hello", lang: "ru" });
    await a.receive({ type: "chat", text: "keep walking offline" });
    expect(a.closes).toEqual([1011]);
    expect(a.client.closed).toBe(true);
  });
  it("waits for an in-flight flush and persists a newer position before shutdown", async () => {
    let release!: () => void;
    const saved: string[] = [];
    const hub = new OnlineHub(storage({ savePlace: async (_guest, _lang, cell) => { saved.push(cell); if (saved.length === 1) await new Promise<void>(done => { release = done; }); } }), "");
    const a = tab(hub, "a"); await a.receive({ type: "hello", lang: "ru" }); await a.receive(pose);
    const first = hub.flush(); await new Promise(done => setImmediate(done));
    await a.receive({ ...pose, cell: "2:0" });
    let finished = false; const last = hub.flush().then(() => { finished = true; });
    await Promise.resolve(); expect(finished).toBe(false);
    release(); await Promise.all([first, last]);
    expect(saved).toEqual(["0:0", "2:0"]);
  });
  it("delivers a watched chunk before concurrent note additions and deletions", async () => {
    let release!: (value: Map<string, Uint8Array>) => void;
    const note = (id: number) => ({ id, cell: "0:0", anchor: null, text: `note ${id}`, author: "other", nick: "Reader", color: "#b02e3a", at: "2026-10-04T00:00:00Z" });
    const hub = new OnlineHub(storage({ notesIn: async () => new Map([["0:0", [note(1)]]]), loadFog: () => new Promise(done => { release = done; }) }), "");
    const store = createOnlineStore(), a = hub.connect("a", "a", message => store.receive(message), () => {});
    await a.receive(JSON.stringify({ type: "hello", lang: "ru" }));
    const watch = a.receive(JSON.stringify({ type: "watch", chunks: ["0:0"] }));
    await new Promise(done => setImmediate(done));
    hub.broadcast("ru", { type: "noted", note: note(2) });
    hub.broadcast("ru", { type: "forgotten", kind: "note", id: 1 });
    release(new Map()); await watch;
    expect(store.notesAt({ x: 0n, floor: 0n }).map(value => value.id)).toEqual([2]);
  });
  it("replays live chat and deletions after an in-flight initial history snapshot", async () => {
    let release!: (value: null) => void;
    const message = (id: number) => ({ id, text: `line ${id}`, author: "other", nick: "Reader", color: "#b02e3a", place: null, at: "2026-10-04T00:00:00Z" });
    const hub = new OnlineHub(storage({ recentMessages: async () => [message(1)], lastPlace: () => new Promise(done => { release = done; }) }), "");
    const store = createOnlineStore(), a = hub.connect("a", "a", frame => store.receive(frame), () => {});
    const hello = a.receive(JSON.stringify({ type: "hello", lang: "ru" }));
    await new Promise(done => setImmediate(done));
    hub.broadcast("ru", { type: "message", message: message(2) });
    hub.broadcast("ru", { type: "forgotten", kind: "chat", id: 1 });
    release(null); await hello;
    expect(store.getSnapshot().messages.map(value => value.id)).toEqual([2]);
  });
});
