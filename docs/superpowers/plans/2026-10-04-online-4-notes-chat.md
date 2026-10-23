# Online Library, plan 4 of 4: notes, chat, moderation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Readers leave notes on what they found — on a gallery or on a fragment of a page — that everyone sees on the map, in the gallery and as ribbons in the books; they talk in one chat per Library and share places that teleport; authors and an admin can take things down, and the admin can ban.

**Architecture:** Notes and messages are Postgres rows; notes travel with the map's chunks (`chunk.notes`) and are broadcast when added (`noted`); messages arrive as the last 200 on hello (`history`) and live (`message`). Every write goes through validation, token buckets and the ban list on the server. On the client the store keeps notes per chunk (a version counter re-renders React lists) and the messages; the 3-D marks are drawn by one component inside the canvas from the stage's place.

**Tech Stack:** as plans 1–3; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-online-library-design.md` — sections 4, 5, 8–10. Plans 1–3 must be done.

## Global Constraints

- No new dependencies. **No git commits or pushes** unless the user asks; ask at the end.
- Texts from other people are rendered as plain text (React escapes it); never `dangerouslySetInnerHTML`, never as a link unless it is a place chip built from validated fields.
- Never print `ADMIN_TOKEN` in chat or logs; it lives in `.env.local` and, once typed, in the admin's own `localStorage` (`babel:admin`).
- Limits (spec 10): chat 300 characters and 1 per 2 s (burst 5); notes 300 and 10 per hour (burst 3); forget/ban 1 per s (burst 5).
- The site works as before offline; chat and note controls are hidden then.
- Comments: short, why not what, British spelling. Shell: one simple command per call; scripts through the Write tool in the session scratchpad.
- The user runs `npm run dev` and `npm run online`; ask them to restart `npm run online` after server changes.
- Every task ends with `npm run typecheck`, `npm run lint`, `npm test` passing.

## Review Focus

- Someone forgets another person's note or message without being admin — must be refused — `canForget` test in Task 3.
- A banned guest reconnects (same cookie, or a new cookie from the same IP) — refused on upgrade — `Bans` test in Task 3.
- A message of only whitespace, 301 characters, or control characters — refused with a reason — `cleanText` tests in Task 1.
- A place chip whose cell or view is forged — dropped by `parseClientMessage` before it reaches anyone — protocol test in Task 1.
- A note on a fragment opens the reader at that page with the fragment marked — `noteHref` test in Task 6.

## File map

New:
- `src/server/moderation.ts` (+ test) — who may forget what; the ban list
- `src/components/online/ChatPanel.tsx` — chat, share place, `/admin`
- `src/components/online/NoteComposer.tsx` — writing a note
- `src/components/online/GalleryNotes.tsx` — the notes of the visitor's gallery (walk HUD)
- `src/components/online/NoteMarks.tsx` — ribbons and pinned sheets in 3-D

Changed: `src/lib/online/protocol.ts` (+ test), `src/server/{schema,db,index}.ts`, `src/components/online/{onlineStore.ts,onlineStore.test.ts,OnlineProvider.tsx,teleport.ts,teleport.test.ts,LibraryMap.tsx,OnlineHud.tsx}`, `src/components/explore/geometry.ts` (+ test: vestibule frames moved here), `src/components/explore/HexGalleryScene.tsx`, `src/components/explore/stage/deskFrame.ts` (+ test: `bookcaseToWorld`), `src/components/explore/stage/StageScene.tsx`, `src/components/explore/ReaderTextPanel.tsx`, the walk and reader pages, `src/app/[locale]/(library)/layout.tsx`, `messages/{ru,en}.json`, READMEs.

## Task order

1 → 2 → 3 → 4 → 5; 6 needs 4; 7 needs 4; 8 needs 5 and 6; 9 last.

---

### Task 1: Protocol — notes, messages, moderation

**Files:**
- Modify: `src/lib/online/protocol.ts`, `src/lib/online/protocol.test.ts`

**Interfaces:**
- Produces:
  - `interface Anchor { wall: number; shelf: number; volume: number; page: number; start: number; end: number }`
  - `interface SharedPlace { cell: string; view: View; fragment?: { page: number; start: number; end: number } }`
  - `interface Note { id: number; cell: string; anchor: Anchor | null; text: string; author: string; nick: string; color: string; at: string }`
  - `interface ChatMessage { id: number; author: string; nick: string; color: string; text: string; place: SharedPlace | null; at: string }`
  - `ClientMessage` gains `{ type: "chat"; text: string; place?: SharedPlace }`, `{ type: "note"; cell: string; anchor: Anchor | null; text: string }`, `{ type: "forget"; kind: "note" | "chat"; id: number }`, `{ type: "ban"; guest: string }`
  - `ServerMessage` gains `{ type: "history"; messages: ChatMessage[] }`, `{ type: "message"; message: ChatMessage }`, `{ type: "noted"; note: Note }`, `{ type: "forgotten"; kind: "note" | "chat"; id: number }`, `{ type: "refused"; reason: "rate" | "length" | "banned" | "invalid" }`; `chunk` gains `notes: Note[]`
  - `TEXT_LIMIT = 300`, `cleanText(raw: unknown): string | null`
- Because `chunk` now requires `notes`, add `notes: []` to the `chunk` frames in plan 3's `onlineStore.test.ts` tests and to the server's `chunk` sends (Task 3 fills them).

- [ ] **Step 1: Failing tests** — append:

```ts
const place = { cell: "1:-1", view: { kind: "desk", wall: 1, shelf: 2, volume: 3, page: 40 }, fragment: { page: 40, start: 10, end: 25 } };

describe("chat and notes", () => {
  it("take a chat line, with or without a place", () => {
    expect(parse({ type: "chat", text: "  нашёл слово!  " })).toEqual({ type: "chat", text: "нашёл слово!" });
    expect(parse({ type: "chat", text: "сюда", place })).toEqual({ type: "chat", text: "сюда", place });
  });

  it("drop a forged place", () => {
    expect(parse({ type: "chat", text: "x", place: { ...place, cell: "nowhere" } })).toBeNull();
    expect(parse({ type: "chat", text: "x", place: { ...place, view: { kind: "desk", wall: 9, shelf: 1, volume: 1, page: 1 } } })).toBeNull();
    expect(parse({ type: "chat", text: "x", place: { ...place, fragment: { page: 40, start: 30, end: 10 } } })).toBeNull();
  });

  it("take a note on a gallery or on a fragment of a page", () => {
    expect(parse({ type: "note", cell: "0:0", anchor: null, text: "тихо тут" })).toMatchObject({ anchor: null });
    const anchor = { wall: 4, shelf: 7, volume: 31, page: 421, start: 0, end: 12 };
    expect(parse({ type: "note", cell: "0:0", anchor, text: "смотри" })).toMatchObject({ anchor });
    expect(parse({ type: "note", cell: "0:0", anchor: { ...anchor, page: 0 }, text: "x" })).toBeNull();
  });

  it("take forget and ban requests", () => {
    expect(parse({ type: "forget", kind: "note", id: 12 })).toEqual({ type: "forget", kind: "note", id: 12 });
    expect(parse({ type: "forget", kind: "guest", id: 12 })).toBeNull();
    expect(parse({ type: "ban", guest: "4b1d0c3e-2a9f-4c55-8e2b-0d6f1e9a7c31" })).not.toBeNull();
    expect(parse({ type: "ban", guest: "me" })).toBeNull();
  });
});

describe("cleanText", () => {
  it("collapses whitespace, trims, and keeps 1..300 printable characters", () => {
    expect(cleanText(" a \n\n b ")).toBe("a b");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText("я".repeat(300))).toHaveLength(300);
    expect(cleanText("я".repeat(301))).toBeNull();
    expect(cleanText("bell\u0007")).toBeNull();
    expect(cleanText(5)).toBeNull();
  });
});
```

(import `cleanText`). Run → FAIL.

- [ ] **Step 2: Implement** — in `protocol.ts` add the types and unions from **Interfaces** above, then:

```ts
/** Longest chat line or note, in characters. */
export const TEXT_LIMIT = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A chat line or a note: whitespace collapsed, trimmed, 1..300 printable characters. */
export function cleanText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  return text.length >= 1 && text.length <= TEXT_LIMIT && !/\p{Cc}/u.test(text) ? text : null;
}

function parseSpan(v: unknown): { page: number; start: number; end: number } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isInt(o.page, 1, LIBRARY.pages) || !isInt(o.start, 0, LIBRARY.pageLength) || !isInt(o.end, 1, LIBRARY.pageLength)) return null;
  return o.start < o.end ? { page: o.page, start: o.start, end: o.end } : null;
}

function parseAnchor(v: unknown): Anchor | null {
  const span = parseSpan(v);
  const o = v as Record<string, unknown>;
  if (!span || !isInt(o.wall, 1, LIBRARY.walls) || !isInt(o.shelf, 1, LIBRARY.shelves) || !isInt(o.volume, 1, LIBRARY.volumes)) return null;
  return { wall: o.wall, shelf: o.shelf, volume: o.volume, ...span };
}

function parsePlace(v: unknown): SharedPlace | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const view = parseView(o.view);
  if (typeof o.cell !== "string" || !parseCellKey(o.cell) || !view) return null;
  if (o.fragment === undefined) return { cell: o.cell, view };
  const fragment = parseSpan(o.fragment);
  return fragment ? { cell: o.cell, view, fragment } : null;
}
```

and the cases in `parseClientMessage`:

```ts
    case "chat": {
      const text = cleanText(o.text);
      if (!text) return null;
      if (o.place === undefined) return { type: "chat", text };
      const place = parsePlace(o.place);
      return place ? { type: "chat", text, place } : null;
    }
    case "note": {
      const text = cleanText(o.text);
      const anchor = o.anchor === null ? null : parseAnchor(o.anchor);
      if (!text || typeof o.cell !== "string" || !parseCellKey(o.cell) || (o.anchor !== null && !anchor)) return null;
      return { type: "note", cell: o.cell, anchor, text };
    }
    case "forget":
      return (o.kind === "note" || o.kind === "chat") && isInt(o.id, 1, Number.MAX_SAFE_INTEGER) ? { type: "forget", kind: o.kind, id: o.id } : null;
    case "ban":
      return typeof o.guest === "string" && UUID.test(o.guest) ? { type: "ban", guest: o.guest } : null;
```

(A whitespace-only or too long text makes the message `null`; the server then answers nothing. Task 3 sends `refused: "length"` by checking `cleanText` before `parseClientMessage` drops it — see there.) Run → PASS; typecheck, lint, test.

---

### Task 2: Schema and queries

**Files:**
- Modify: `src/server/schema.ts`, `src/server/db.ts`

**Interfaces:**
- Produces: `addNote(lang, chunk, note: { cell; anchor; text; author }): Promise<{ id: number; at: string }>`, `notesIn(lang, chunks: string[]): Promise<Map<string, Note[]>>`, `addMessage(lang, m: { author; text; place }): Promise<{ id: number; at: string }>`, `recentMessages(lang, limit = 200): Promise<ChatMessage[]>`, `authorOf(kind, id): Promise<string | null>`, `forget(kind, id): Promise<void>`, `addBan(guest: string, ip: string | null): Promise<void>`, `loadBans(): Promise<{ guests: string[]; ips: string[] }>`. (The author's nick and colour for a new note or message come from the connection, not from a query.)

- [ ] **Step 1: Schema** — append to `SCHEMA` the `notes`, `messages` and `bans` tables and indexes exactly as in spec section 5, each `create table if not exists` / `create index if not exists`.

- [ ] **Step 2: Queries** — append to `db.ts` (import `type Anchor, type ChatMessage, type Note, type SharedPlace` from the protocol):

```ts
type NoteRow = { id: string; chunk: string; cell: string; anchor: Anchor | null; text: string; author: string; nick: string; color: string; at: Date };

const toNote = (r: NoteRow): Note => ({ id: Number(r.id), cell: r.cell, anchor: r.anchor, text: r.text, author: r.author, nick: r.nick, color: r.color, at: r.at.toISOString() });

export async function addNote(lang: string, chunk: string, n: { cell: string; anchor: Anchor | null; text: string; author: string }) {
  const [row] = await sql<{ id: string; at: Date }[]>`
    insert into notes (lang, chunk, cell, anchor, text, author)
    values (${lang}, ${chunk}, ${n.cell}, ${n.anchor ? sql.json(n.anchor) : null}, ${n.text}, ${n.author})
    returning id, created_at as at`;
  return { id: Number(row.id), at: row.at.toISOString() };
}

/** The notes of some chunks, at most 200 per chunk, newest first. */
export async function notesIn(lang: string, chunks: string[]): Promise<Map<string, Note[]>> {
  const out = new Map<string, Note[]>();
  if (chunks.length === 0) return out;
  const rows = await sql<NoteRow[]>`
    select * from (
      select n.id, n.chunk, n.cell, n.anchor, n.text, n.author, g.nick, g.color, n.created_at as at,
             row_number() over (partition by n.chunk order by n.id desc) as rank
      from notes n join guests g on g.id = n.author
      where n.lang = ${lang} and n.chunk in ${sql(chunks)} and not n.forgotten
    ) ranked where rank <= 200`;
  for (const r of rows) {
    const list = out.get(r.chunk) ?? [];
    list.push(toNote(r));
    out.set(r.chunk, list);
  }
  return out;
}

export async function addMessage(lang: string, m: { author: string; text: string; place: SharedPlace | null }) {
  const [row] = await sql<{ id: string; at: Date }[]>`
    insert into messages (lang, author, text, place) values (${lang}, ${m.author}, ${m.text}, ${m.place ? sql.json(m.place) : null})
    returning id, created_at as at`;
  return { id: Number(row.id), at: row.at.toISOString() };
}

/** The last messages of a Library, oldest first. */
export async function recentMessages(lang: string, limit = 200): Promise<ChatMessage[]> {
  const rows = await sql<{ id: string; author: string; nick: string; color: string; text: string; place: SharedPlace | null; at: Date }[]>`
    select m.id, m.author, g.nick, g.color, m.text, m.place, m.created_at as at
    from messages m join guests g on g.id = m.author
    where m.lang = ${lang} and not m.forgotten
    order by m.id desc limit ${limit}`;
  return rows.reverse().map((r) => ({ ...r, id: Number(r.id), at: r.at.toISOString() }));
}

const TABLE = { note: "notes", chat: "messages" } as const;

export async function authorOf(kind: "note" | "chat", id: number): Promise<string | null> {
  const [row] = await sql<{ author: string }[]>`select author from ${sql(TABLE[kind])} where id = ${id} and not forgotten`;
  return row?.author ?? null;
}

export async function forget(kind: "note" | "chat", id: number): Promise<void> {
  await sql`update ${sql(TABLE[kind])} set forgotten = true where id = ${id}`;
}

export async function addBan(guest: string, ip: string | null): Promise<void> {
  await sql`insert into bans (guest, ip) values (${guest}, ${ip})`;
}

export async function loadBans(): Promise<{ guests: string[]; ips: string[] }> {
  const rows = await sql<{ guest: string | null; ip: string | null }[]>`select guest, ip from bans`;
  return { guests: rows.flatMap((r) => (r.guest ? [r.guest] : [])), ips: rows.flatMap((r) => (r.ip ? [r.ip] : [])) };
}
```

- [ ] **Step 3: Verify** — typecheck, lint, test; ask the user to restart `npm run online`; `docker compose exec db psql -U babel -c "\dt"` lists `notes`, `messages`, `bans`.

---

### Task 3: The server — notes, chat, moderation

**Files:**
- Create: `src/server/moderation.ts`, `src/server/moderation.test.ts`
- Modify: `src/server/index.ts`

**Interfaces:**
- Produces: `canForget(author: string | null, guest: string, admin: boolean): boolean`; `class Bans { constructor(initial?: { guests: string[]; ips: string[] }); add(guest: string, ip: string | null): void; has(guest: string, ip: string): boolean }`.

- [ ] **Step 1: Failing tests** — `src/server/moderation.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Bans, canForget } from "./moderation";

describe("canForget", () => {
  it("lets authors and the admin take things down, nobody else", () => {
    expect(canForget("a", "a", false)).toBe(true);
    expect(canForget("a", "b", true)).toBe(true);
    expect(canForget("a", "b", false)).toBe(false);
    expect(canForget(null, "a", true)).toBe(false); // already gone
  });
});

describe("Bans", () => {
  it("keep out a banned guest under any cookie from the same address, and the cookie from anywhere", () => {
    const bans = new Bans({ guests: ["g1"], ips: [] });
    bans.add("g2", "203.0.113.7");
    expect(bans.has("g1", "198.51.100.1")).toBe(true);
    expect(bans.has("g3", "203.0.113.7")).toBe(true);
    expect(bans.has("g3", "198.51.100.1")).toBe(false);
  });

  it("never ban the empty address (local sockets without one)", () => {
    const bans = new Bans();
    bans.add("g", "");
    expect(bans.has("other", "")).toBe(false);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `src/server/moderation.ts`**

```ts
/** Authors take their own things down; the admin anything. Something already gone stays gone. */
export const canForget = (author: string | null, guest: string, admin: boolean): boolean => author !== null && (admin || author === guest);

/** Banned guests and the addresses they were banned from, in memory (Postgres has the same, for restarts). */
export class Bans {
  private readonly guests: Set<string>;
  private readonly ips: Set<string>;

  constructor(initial: { guests: string[]; ips: string[] } = { guests: [], ips: [] }) {
    this.guests = new Set(initial.guests);
    this.ips = new Set(initial.ips.filter(Boolean));
  }

  add(guest: string, ip: string | null): void {
    this.guests.add(guest);
    if (ip) this.ips.add(ip);
  }

  has(guest: string, ip: string): boolean {
    return this.guests.has(guest) || (ip !== "" && this.ips.has(ip));
  }
}
```

Run → PASS.

- [ ] **Step 3: Wire it** — in `src/server/index.ts`:
  - `let bans = new Bans();` and in the start-up chain `migrate().then(loadBans).then((b) => { bans = new Bans(b); http.listen(…); })`.
  - In `upgrade`, refuse `bans.has(guest, addressOf(req))` like a bad cookie (403).
  - To `Client` add `chats: new Bucket(0.5, 5)`, `notes: new Bucket(10 / 3600, 3)`, `mods: new Bucket(1, 5)`.
  - `hello` also sends `{ type: "history", messages: await recentMessages(lang) }` after `welcome`.
  - `watch` also loads `const notes = await notesIn(lang, m.chunks);` and every `chunk` frame carries `notes: notes.get(key) ?? []`.
  - Before `parseClientMessage` drops a too-long or empty text, tell the sender why:

```ts
  ws.on("message", (data) => {
    const raw = data.toString();
    const m = parseClientMessage(raw);
    if (m) return void handle(c, m).catch((e) => console.error("message", e));
    // A chat line or note refused only for its text: say so, the composer keeps it for editing.
    try {
      const o = JSON.parse(raw) as { type?: string; text?: unknown };
      if ((o.type === "chat" || o.type === "note") && cleanText(o.text) === null) send(ws, { type: "refused", reason: "length" });
    } catch {
      // not JSON: dropped
    }
  });
```

  - New branches in `handle` (after the `lang` check):

```ts
  const refuse = (reason: "rate" | "banned") => send(c.ws, { type: "refused", reason });
  const writing = m.type === "chat" || m.type === "note" || m.type === "forget" || m.type === "ban";
  if (writing && bans.has(c.guest, c.ip)) return refuse("banned");

  if (m.type === "chat") {
    if (!c.chats.take()) return refuse("rate");
    const place = m.place ?? null;
    const { id, at } = await addMessage(lang, { author: c.guest, text: m.text, place });
    broadcast(lang, { type: "message", message: { id, author: c.guest, nick: c.nick, color: c.color, text: m.text, place, at } });
    return;
  }

  if (m.type === "note") {
    if (!c.notes.take()) return refuse("rate");
    const chunk = chunkKeyOf(parseCellKey(m.cell)!);
    const { id, at } = await addNote(lang, chunk, { cell: m.cell, anchor: m.anchor, text: m.text, author: c.guest });
    broadcast(lang, { type: "noted", note: { id, cell: m.cell, anchor: m.anchor, text: m.text, author: c.guest, nick: c.nick, color: c.color, at } });
    return;
  }

  if (m.type === "forget") {
    if (!c.mods.take()) return refuse("rate");
    if (!canForget(await authorOf(m.kind, m.id), c.guest, c.admin)) return;
    await forget(m.kind, m.id);
    broadcast(lang, { type: "forgotten", kind: m.kind, id: m.id });
    return;
  }

  if (m.type === "ban") {
    if (!c.admin || m.guest === c.guest || !c.mods.take()) return;
    const sockets = [...clients.values()].flatMap((set) => [...set]).filter((other) => other.guest === m.guest);
    const ip = sockets[0]?.ip ?? null;
    bans.add(m.guest, ip);
    await addBan(m.guest, ip);
    for (const other of sockets) other.ws.close(4003, "banned");
  }
```

  (The ban closes the guest's sockets; their `close` handlers broadcast `left` as usual. Imports: `cleanText` from the protocol, `chunkKeyOf`, `parseCellKey` from `@/lib/world`, the new db functions, `Bans`, `canForget`.)

- [ ] **Step 4: Smoke** — extend the scratchpad smoke script into two guests A and B (two cookies): A sends `chat` "проверка", B receives `message`; A sends a `note` on `"0:0"`; B's `watch(["0:0"])` gets it in `chunk.notes`; B sends `forget` of A's note → nothing happens (no `forgotten`); A forgets it → both get `forgotten`; A sends 7 chats at once → `refused: "rate"` after the fifth; A sends `"   "` → `refused: "length"`. For the admin: a third socket whose `hello` carries `ADMIN_TOKEN` read from `.env.local` bans B → B's socket closes with 4003, and B reconnecting gets HTTP 403.

- [ ] **Step 5: Verify** — typecheck, lint, test.

---

### Task 4: The client keeps notes and messages

**Files:**
- Modify: `src/components/online/onlineStore.ts`, `src/components/online/onlineStore.test.ts`, `src/components/online/OnlineProvider.tsx`

**Interfaces:**
- Produces on `OnlineSnapshot`: `messages: ChatMessage[]` (≤ 200, oldest first), `notesVersion: number`, `refused: { reason: string; at: number } | null`.
- Produces on `OnlineStore`: `notes: Map<string, Note[]>` (chunk key → notes, newest first), `notesAt(cell: Cell): Note[]`, `reconnect(): void` (replaced by the provider).
- `OnlineProvider` sends `admin` in `hello` from `localStorage["babel:admin"]` (read in try/catch).

- [ ] **Step 1: Failing tests** — append:

```ts
describe("notes and messages", () => {
  const welcome = { type: "welcome" as const, you: me, last: null, admin: false };
  const note = (id: number, cell: string) => ({ id, cell, anchor: null, text: `n${id}`, author: "a", nick: "a", color: "#b02e3a", at: "2026-10-04T00:00:00Z" });
  const message = (id: number) => ({ id, author: "a", nick: "a", color: "#b02e3a", text: `m${id}`, place: null, at: "2026-10-04T00:00:00Z" });

  it("keeps the notes of chunks, adds new ones and forgets taken-down ones", () => {
    const store = createOnlineStore();
    store.receive(welcome);
    store.receive({ type: "chunk", key: "0:0", fog: "", notes: [note(1, "3:4")] });
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

  it("remembers the last refusal", () => {
    const store = createOnlineStore();
    store.receive({ type: "refused", reason: "rate" }, 1234);
    expect(store.getSnapshot().refused).toEqual({ reason: "rate", at: 1234 });
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement** — in `onlineStore.ts`: initial snapshot gets `messages: []`, `notesVersion: 0`, `refused: null`; add `const notes = new Map<string, Note[]>();` (cleared with `chunks` on offline). Cases:

```ts
        case "chunk":
          chunks.set(m.key, fogFromBase64(m.fog));
          notes.set(m.key, m.notes);
          set({ notesVersion: snapshot.notesVersion + 1 });
          return;
        case "noted": {
          const key = chunkKeyOf(parseCellKey(m.note.cell)!);
          const list = notes.get(key);
          if (!list) return;
          notes.set(key, [m.note, ...list]);
          set({ notesVersion: snapshot.notesVersion + 1 });
          return;
        }
        case "forgotten":
          if (m.kind === "chat") {
            set({ messages: snapshot.messages.filter((x) => x.id !== m.id) });
            return;
          }
          for (const [key, list] of notes) if (list.some((n) => n.id === m.id)) notes.set(key, list.filter((n) => n.id !== m.id));
          set({ notesVersion: snapshot.notesVersion + 1 });
          return;
        case "history":
          set({ messages: m.messages.slice(-200) });
          return;
        case "message":
          set({ messages: [...snapshot.messages, m.message].slice(-200) });
          return;
        case "refused":
          set({ refused: { reason: m.reason, at: now } });
          return;
```

and the members `notes`, `notesAt: (cell) => (notes.get(chunkKeyOf(cell)) ?? []).filter((n) => n.cell === cellKey(cell))`, `reconnect: () => {}`. Run → PASS.

- [ ] **Step 3: Provider** — in `OnlineProvider.tsx`: read the admin token for `hello`:

```ts
function adminToken(): string | undefined {
  try {
    return localStorage.getItem("babel:admin") ?? undefined;
  } catch {
    return undefined;
  }
}
```

`const hello: ClientMessage = { type: "hello", lang: …, ...(adminToken() && { admin: adminToken() }) };` and set `store.reconnect = () => socket.close();` in `onopen` (the `onclose` handler then reconnects after a second). Typecheck, lint, test.

---

### Task 5: The chat

**Files:**
- Create: `src/components/online/ChatPanel.tsx`
- Modify: `src/components/online/teleport.ts` (+ test: `placeChipHref`), `src/app/[locale]/(library)/layout.tsx`, `messages/{ru,en}.json` (`Chat`)

**Interfaces:**
- Consumes: store (Task 4), `viewOf`, `presenceOf` maths (plan 2), `viewHref` (plan 3), `isTypingTarget`, the stage store (`place`, `view`, `desk.spread`, `desk.mark`).
- Produces: `sharedPlaceHref(place: SharedPlace): string`; `ChatPanel` (bottom-left over the stage, `zIndex` 6).

- [ ] **Step 1: Failing test** — append to `teleport.test.ts`:

```ts
  it("lead to a shared place, with its fragment marked", () => {
    const view = { kind: "desk" as const, wall: 1, shelf: 2, volume: 3, page: 40 };
    expect(sharedPlaceHref({ cell: "-3:7", view })).toBe(`/page/${hex}-1-2-3-40`);
    expect(sharedPlaceHref({ cell: "-3:7", view, fragment: { page: 41, start: 5, end: 9 } })).toBe(`/page/${hex}-1-2-3-41?text=41:5-9`);
    expect(sharedPlaceHref({ cell: "-3:7", view: { kind: "walk", wall: 2 } })).toBe(`/explore/wall/2?hex=${hex}`);
  });
```

Run → FAIL.

- [ ] **Step 2: Implement** in `teleport.ts`:

```ts
/** A place someone shared: their view there, and the fragment they marked (which names its own page). */
export function sharedPlaceHref(place: SharedPlace): string {
  const cell = parseCellKey(place.cell)!;
  const { fragment } = place;
  if (place.view.kind === "desk" && fragment) {
    return `/page/${addressOf(cell)}-${place.view.wall}-${place.view.shelf}-${place.view.volume}-${fragment.page}?text=${fragment.page}:${fragment.start}-${fragment.end}`;
  }
  return viewHref(cell, place.view);
}
```

(`?text=page:start-end` is the reader's own fragment link, `formatFragment`.) Run → PASS.

- [ ] **Step 3: Messages** — `ru.json`:

```json
  "Chat": {
    "open": "T — написать",
    "placeholder": "Сообщение для всех в Библиотеке…",
    "send": "Отправить",
    "share": "Место",
    "shareTitle": "Приложить место, где вы сейчас (галерею, книгу, страницу, отмеченный фрагмент)",
    "shared": "место приложено",
    "go": "перейти",
    "forget": "удалить",
    "ban": "бан",
    "banTitle": "Запретить этому гостю писать и входить",
    "adminOn": "Вы модератор в этой Библиотеке",
    "adminOff": "Вы больше не модератор",
    "rate": "Слишком часто — подождите немного",
    "length": "Пустое сообщение или длиннее 300 символов",
    "banned": "Вам запрещено писать в этой Библиотеке",
    "invalid": "Сообщение не принято"
  }
```

`en.json`:

```json
  "Chat": {
    "open": "T — write",
    "placeholder": "A message for everyone in the Library…",
    "send": "Send",
    "share": "Place",
    "shareTitle": "Attach where you are (the gallery, the book, the page, the marked fragment)",
    "shared": "place attached",
    "go": "go",
    "forget": "delete",
    "ban": "ban",
    "banTitle": "Bar this guest from writing and coming in",
    "adminOn": "You moderate this Library",
    "adminOff": "You no longer moderate",
    "rate": "Too fast — wait a little",
    "length": "Empty, or longer than 300 characters",
    "banned": "You may not write in this Library",
    "invalid": "Message not accepted"
  }
```

- [ ] **Step 4: `src/components/online/ChatPanel.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Flex, Input, Text, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { isTypingTarget } from "@/components/explore/GalleryControls";
import { useStageStore } from "@/components/explore/stage/StageProvider";
import { TEXT_LIMIT, cleanText, type ChatMessage, type SharedPlace } from "@/lib/online/protocol";
import { cellKey } from "@/lib/world";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import { viewOf } from "./presence";
import { sharedPlaceHref } from "./teleport";

const mono = "var(--font-jetbrains), monospace";
/** Closed, the panel shows lines younger than this (ms). */
const FADE = 10_000;
const SHOWN = 8;

/** The place the visitor is at, as a chip for a message. */
function placeHere(stage: ReturnType<typeof useStageStore>): SharedPlace | null {
  const { place, view, desk } = stage.getSnapshot();
  const pose = stage.commands.visitorPose?.();
  if (!place || !view || !pose) return null;
  const shared: SharedPlace = { cell: cellKey(place.cell), view: viewOf(view, pose.yaw, desk?.spread ?? 0) };
  return view.kind === "desk" && view.mode === "read" && desk?.mark ? { ...shared, fragment: desk.mark } : shared;
}

/** One chat for everyone in this Library: T to write, Enter to send, Esc to close; `/admin <token>` to moderate. */
export default function ChatPanel() {
  const t = useTranslations("Chat");
  const router = useRouter();
  const online = useOnlineStore();
  const stage = useStageStore();
  const status = useOnlineSelector((s) => s.status);
  const messages = useOnlineSelector((s) => s.messages);
  const you = useOnlineSelector((s) => s.you);
  const admin = useOnlineSelector((s) => s.admin);
  const refused = useOnlineSelector((s) => s.refused);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [place, setPlace] = useState<SharedPlace | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [, tick] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // T opens the input, wherever the mouse is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.code !== "KeyT") return;
      e.preventDefault();
      stage.commands.release?.();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  // Closed, old lines fade: re-render once a second while any line is still young.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (refused) setNote(t(refused.reason as "rate"));
  }, [refused, t]);

  if (status !== "online" || !you) return null;

  const send = () => {
    const command = /^\/admin(?:\s+(\S+))?$/.exec(text.trim());
    if (command) {
      try {
        if (command[1]) localStorage.setItem("babel:admin", command[1]);
        else localStorage.removeItem("babel:admin");
      } catch {
        // private window: the token lasts for this connection only
      }
      setNote(command[1] ? t("adminOn") : t("adminOff"));
      setText("");
      online.reconnect();
      return;
    }
    const clean = cleanText(text);
    if (!clean) return setNote(t("length"));
    online.send(place ? { type: "chat", text: clean, place } : { type: "chat", text: clean });
    setText("");
    setPlace(null);
  };

  const now = Date.now();
  const shown = (open ? messages.slice(-40) : messages.filter((m) => now - Date.parse(m.at) < FADE).slice(-SHOWN)) as ChatMessage[];

  return (
    <Box position="absolute" left={{ base: 3, md: 6 }} bottom={{ base: 20, md: 24 }} zIndex={6} w="min(420px, calc(100% - 24px))" fontFamily={mono} fontSize="12px" pointerEvents="none">
      <Box maxH={open ? "40vh" : "none"} overflowY={open ? "auto" : "visible"} pointerEvents={open ? "auto" : "none"} bg={open ? "rgba(8,8,15,0.8)" : "transparent"} borderRadius="8px" p={open ? 2 : 0}>
        {shown.map((m) => (
          <Flex key={m.id} gap={2} py="2px" align="baseline" textShadow="0 0 4px #000">
            <Text as="span" color={m.color} flex="none">
              {m.nick}
            </Text>
            <Text as="span" color="dark.50" wordBreak="break-word">
              {m.text}
              {m.place && (
                <chakra.button ml={2} color="brand.300" cursor="pointer" pointerEvents="auto" onClick={() => router.push(sharedPlaceHref(m.place!))}>
                  [{t("go")}]
                </chakra.button>
              )}
              {open && (m.author === you.id || admin) && (
                <chakra.button ml={2} color="dark.300" cursor="pointer" onClick={() => online.send({ type: "forget", kind: "chat", id: m.id })}>
                  {t("forget")}
                </chakra.button>
              )}
              {open && admin && m.author !== you.id && (
                <chakra.button ml={2} color="red.400" cursor="pointer" title={t("banTitle")} onClick={() => online.send({ type: "ban", guest: m.author })}>
                  {t("ban")}
                </chakra.button>
              )}
            </Text>
          </Flex>
        ))}
      </Box>
      {note && open && (
        <Text color="dark.300" mt={1}>
          {note}
        </Text>
      )}
      {open ? (
        <Flex mt={2} gap={2} pointerEvents="auto">
          <Input
            ref={input}
            size="sm"
            value={text}
            maxLength={TEXT_LIMIT + 50}
            placeholder={t("placeholder")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <chakra.button color={place ? "brand.300" : "dark.200"} title={t("shareTitle")} cursor="pointer" onClick={() => setPlace(place ? null : placeHere(stage))}>
            {place ? t("shared") : t("share")}
          </chakra.button>
        </Flex>
      ) : (
        <Text color="dark.400" mt={1}>
          {t("open")}
        </Text>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Layout** — render `<ChatPanel />` after `<MapLayer />` in the `(library)` layout. Check by screenshot that it does not cover the HUD's bottom bar (adjust `bottom`) and that the reader's right panel does not hide it.

- [ ] **Step 6: Verify** — typecheck, lint, test. Chrome: press T, write "привет", Enter — the line appears and fades after 10 s; the smoke guest's lines appear too. "Место" + Enter while reading a page with a marked fragment: the chip "[перейти]" opens that spread with the fragment marked (in another tab). `/admin <token>` (read the token from `.env.local` yourself; do not show it): "удалить" and "бан" appear on others' lines.

---

### Task 6: Notes — writing, listing, the map

**Files:**
- Create: `src/components/online/NoteComposer.tsx`, `src/components/online/GalleryNotes.tsx`
- Modify: `src/components/online/teleport.ts` (+ test: `noteHref`), `src/components/explore/ReaderTextPanel.tsx` (optional `onNote`), the reader page (`src/app/[locale]/(library)/page/[address]/page.tsx`), the walk page, `src/components/online/LibraryMap.tsx` (pins), `messages/{ru,en}.json` (`Notes`, `Reader.leaveNote`)

**Interfaces:**
- Consumes: store `notes`, `notesAt`, `notesVersion`, `watch` (Task 4); `chunkKeyOf`, `offsetCell`, `cellOf` (world).
- Produces: `noteHref(note: Note): string`; `NoteComposer({ cell: Cell; anchor: Anchor | null; onDone(): void })`; `GalleryNotes({ cell: Cell })`.

- [ ] **Step 1: Failing test** — append to `teleport.test.ts`:

```ts
  it("lead to a note: its page with the fragment marked, or its gallery", () => {
    const base = { id: 1, cell: "-3:7", text: "x", author: "a", nick: "a", color: "#b02e3a", at: "" };
    expect(noteHref({ ...base, anchor: null })).toBe(`/explore/wall/1?hex=${hex}`);
    expect(noteHref({ ...base, anchor: { wall: 2, shelf: 3, volume: 4, page: 5, start: 6, end: 7 } })).toBe(`/page/${hex}-2-3-4-5?text=5:6-7`);
  });
```

Run → FAIL. Implement:

```ts
export function noteHref(note: Note): string {
  const cell = parseCellKey(note.cell)!;
  const a = note.anchor;
  return a ? `/page/${addressOf(cell)}-${a.wall}-${a.shelf}-${a.volume}-${a.page}?text=${a.page}:${a.start}-${a.end}` : placeHref(cell);
}
```

Run → PASS.

- [ ] **Step 2: Messages** — `ru.json`:

```json
  "Notes": {
    "here": "Заметка здесь",
    "hereTitle": "Оставить заметку в этой галерее — её увидят все",
    "placeholder": "Что здесь? До 300 символов",
    "save": "Оставить",
    "cancel": "Отмена",
    "title": "{count, plural, one {# заметка} few {# заметки} many {# заметок} other {# заметки}} в этой галерее",
    "onPage": "к странице {page}",
    "forget": "удалить"
  }
```

and `Reader.leaveNote`: "заметка", `Reader.leaveNoteTitle`: "Оставить заметку к этому фрагменту — её увидят все, кто придёт в эту галерею"; `en.json`:

```json
  "Notes": {
    "here": "Note here",
    "hereTitle": "Leave a note in this gallery for everyone to see",
    "placeholder": "What is here? Up to 300 characters",
    "save": "Leave it",
    "cancel": "Cancel",
    "title": "{count, plural, one {# note} other {# notes}} in this gallery",
    "onPage": "to page {page}",
    "forget": "delete"
  }
```

and `Reader.leaveNote`: "note", `Reader.leaveNoteTitle`: "Leave a note on this fragment for everyone who comes to this gallery".

- [ ] **Step 3: `src/components/online/NoteComposer.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Box, Flex, Textarea, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { TEXT_LIMIT, cleanText, type Anchor } from "@/lib/online/protocol";
import { cellKey, type Cell } from "@/lib/world";
import { useOnlineStore } from "./OnlineProvider";

/** Writing a note on a gallery (anchor null) or on a fragment of a page. */
export default function NoteComposer({ cell, anchor, onDone }: { cell: Cell; anchor: Anchor | null; onDone: () => void }) {
  const t = useTranslations("Notes");
  const online = useOnlineStore();
  const [text, setText] = useState("");
  const clean = cleanText(text);
  const save = () => {
    if (!clean) return;
    online.send({ type: "note", cell: cellKey(cell), anchor, text: clean });
    onDone();
  };
  return (
    <Box p={3} borderRadius="8px" bg="rgba(8,8,15,0.92)" border="1px solid" borderColor="brand.300/30" pointerEvents="auto" w="min(360px, 90vw)">
      <Textarea
        autoFocus
        size="sm"
        rows={3}
        value={text}
        maxLength={TEXT_LIMIT}
        placeholder={t("placeholder")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") onDone();
        }}
      />
      <Flex justify="flex-end" gap={3} mt={2} fontSize="12px">
        <chakra.button color="dark.300" cursor="pointer" onClick={onDone}>
          {t("cancel")}
        </chakra.button>
        <chakra.button color={clean ? "brand.300" : "dark.400"} cursor={clean ? "pointer" : "default"} onClick={save}>
          {t("save")}
        </chakra.button>
      </Flex>
    </Box>
  );
}
```

- [ ] **Step 4: `src/components/online/GalleryNotes.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { chunkKeyOf, type Cell } from "@/lib/world";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import { noteHref } from "./teleport";

/** The notes of the visitor's gallery, newest first. */
export default function GalleryNotes({ cell }: { cell: Cell }) {
  const t = useTranslations("Notes");
  const router = useRouter();
  const online = useOnlineStore();
  const you = useOnlineSelector((s) => s.you?.id);
  const admin = useOnlineSelector((s) => s.admin);
  useOnlineSelector((s) => s.notesVersion);
  useEffect(() => online.watch([chunkKeyOf(cell)]), [online, cell]);
  const notes = online.notesAt(cell);
  if (notes.length === 0) return null;
  return (
    <Box p={3} borderRadius="8px" bg="rgba(8,8,15,0.8)" fontFamily="var(--font-jetbrains), monospace" fontSize="11px" maxH="30vh" overflowY="auto" pointerEvents="auto" w="min(340px, 90vw)">
      <Text color="dark.300" mb={2}>
        {t("title", { count: notes.length })}
      </Text>
      {notes.map((n) => (
        <Box key={n.id} mb={2}>
          <Flex gap={2} align="baseline">
            <Text color={n.color}>{n.nick}</Text>
            {n.anchor && (
              <chakra.button color="brand.300" cursor="pointer" onClick={() => router.push(noteHref(n))}>
                {t("onPage", { page: n.anchor.page })}
              </chakra.button>
            )}
            {(n.author === you || admin) && (
              <chakra.button ml="auto" color="dark.400" cursor="pointer" onClick={() => online.send({ type: "forget", kind: "note", id: n.id })}>
                {t("forget")}
              </chakra.button>
            )}
          </Flex>
          <Text color="dark.50" wordBreak="break-word">
            {n.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 5: Walk page** — while online, add to the bottom bar `<HudButton onClick={() => setComposing(true)} title={notes("hereTitle")}>{notes("here")}</HudButton>`; render, positioned above the bottom bar on the left (absolute box, `pointerEvents: "auto"`), either `<NoteComposer cell={place.cell} anchor={null} onDone={() => setComposing(false)} />` while composing, or `<GalleryNotes cell={place.cell} />`. Online status from `useOnlineSelector((s) => s.status === "online")`; `notes = useTranslations("Notes")`.

- [ ] **Step 6: Reader** — `ReaderTextPanel` gets an optional `onNote?: () => void` (doc: "Leave a note on the marked fragment; absent while offline.") and, in the fragment bar next to the share button, `{onNote && <HudButton onClick={onNote} title={t("leaveNoteTitle")}>{t("leaveNote")}</HudButton>}`. The reader page passes `onNote={online && fragments.mark ? () => setNoting(true) : undefined}` and, while `noting`, renders over the HUD (bottom centre) `<NoteComposer cell={cellOf(address.hex)} anchor={{ wall: address.wall, shelf: address.shelf, volume: address.volume, ...fragments.mark }} onDone={() => setNoting(false)} />` — compute `cellOf(address.hex)` once with `useMemo` (it costs a few ms).

- [ ] **Step 7: Pins on the map** — in `LibraryMap.tsx` `draw`, after the explored galleries: for each visible chunk, for each note of `online.notes.get(key)`, draw a pin at `pointOf(view, w, h, cell, 0.5, 0.8)` (a 3 px red circle `#c0392b` with a 1 px light outline; skip duplicates per cell). Picking (full map): a click within `PICK_RADIUS` of a pin, checked after readers, opens the popover with kind `"note"` showing nick, text and a button "Go here" → `go(noteHref(note))`. Extend `Target` with `{ kind: "note"; note: Note; cell: Cell }` and the popover accordingly.

- [ ] **Step 8: Verify** — typecheck, lint, test. Chrome: "Note here" → write → the list shows it; the smoke guest's `watch` gets it; on the full map a pin shows in that gallery and its popover leads there. In the reader: select text → "note" → write → in the gallery list it says "to page N" and leads back to the marked fragment.

---

### Task 7: Notes in the gallery

**Files:**
- Modify: `src/components/explore/geometry.ts` (+ test) — move `vestibuleFrame`/`vestibulePoint` here from `HexGalleryScene.tsx` and export them
- Modify: `src/components/explore/stage/deskFrame.ts` (+ test) — `bookcaseYaw`, `bookcaseToWorld`
- Create: `src/components/online/NoteMarks.tsx`
- Modify: `src/components/explore/stage/StageScene.tsx`

**Interfaces:**
- Produces: `vestibuleFrame(col, level): { position: [number, number, number]; rotation: number }`, `vestibulePoint(col, level, x, y, z)` (geometry); `bookcaseYaw(wall: number): number`, `bookcaseToWorld(level, col, wall, p: THREE.Vector3Like, out?): THREE.Vector3` (deskFrame); `NoteMarks` (inside the canvas).

- [ ] **Step 1: Failing tests** — `geometry.test.ts`:

```ts
describe("vestibule frames", () => {
  it("stand at the east doorway of their gallery, facing into it", () => {
    const { position, rotation } = vestibuleFrame(2, 1);
    const [cx, cy, cz] = galleryCenter(2, 1);
    expect(Math.hypot(position[0] - cx, position[2] - cz)).toBeCloseTo(ROOM.apothem, 9);
    expect(position[1]).toBe(cy);
    expect(vestibulePoint(2, 1, 0, 0, 0)).toEqual(position);
    expect(typeof rotation).toBe("number");
  });
});
```

`deskFrame.test.ts`:

```ts
describe("bookcaseToWorld", () => {
  it("puts a volume's box centre where shelfBookPose puts the book", () => {
    const seed = 1234;
    for (const [level, col, wall, shelf, volume] of [[0, 0, 1, 4, 18], [2, -3, 4, 1, 1]]) {
      const b = planBookcase(seed, wall).placements.find((p) => p.shelf === shelf && p.volume === volume)!;
      const at = bookcaseToWorld(level, col, wall, { x: b.x, y: b.y, z: b.z });
      expect(at.distanceTo(shelfBookPose(level, col, wall, shelf, volume, seed).position)).toBeLessThan(1e-9);
    }
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement** — cut `vestibuleFrame` and `vestibulePoint` (plan 1's versions, taking `(col, level)`) from `HexGalleryScene.tsx` into `geometry.ts` (exported, after `galleryCenter`), and import them back into `HexGalleryScene.tsx`. In `deskFrame.ts`:

```ts
/** rotation.y of the bookcase of wall 1..4: its local +z faces the room. */
export const bookcaseYaw = (wall: number): number => facingCenterRotation(sideAngle(wallSide(wall)));

/** A point in the frame of the bookcase of wall 1..4 (as Bookcase draws it) of the gallery at (level, col), in the world. */
export function bookcaseToWorld(level: number, col: number, wall: number, p: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 {
  const u = towardsWall(wall);
  turnY(p, bookcaseYaw(wall), out);
  out.x += u.x * BOOKCASE_RADIUS;
  out.z += u.z * BOOKCASE_RADIUS;
  return galleryToWorld(level, col, out, out);
}
```

and make `shelfBookPose` use both (`const caseYaw = bookcaseYaw(wall); const center = bookcaseToWorld(level, col, wall, { x, y, z });`). Run → PASS.

- [ ] **Step 3: `src/components/online/NoteMarks.tsx`**

```tsx
"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ROOM, vestibuleFrame, vestibulePoint } from "@/components/explore/geometry";
import { CASE, planBookcase } from "@/components/explore/bookcasePlan";
import { bookcaseToWorld, bookcaseYaw } from "@/components/explore/stage/deskFrame";
import { useStageSelector } from "@/components/explore/stage/StageProvider";
import type { WorldPlace } from "@/components/explore/HexGalleryScene";
import { hashString } from "@/lib/hex";
import { addressOf, chunkKeyOf, offsetCell, type Cell } from "@/lib/world";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import type { OnlineStore } from "./onlineStore";

const RIBBON = new THREE.MeshStandardMaterial({ color: "#9e1b2a", roughness: 0.7, side: THREE.DoubleSide });
const RIBBON_GEOMETRY = new THREE.PlaneGeometry(0.014, 0.1);
const SHEET = new THREE.MeshStandardMaterial({ color: "#e6dbc2", roughness: 0.95 });
const SHEET_GEOMETRY = new THREE.PlaneGeometry(0.21, 0.297);
/** The sheet hangs on the wall beside the east doorway, at eye height, in the frame of the vestibule there. */
const SHEET_LOCAL = new THREE.Vector3(-(ROOM.doorWidth / 2 + (ROOM.radius - ROOM.doorWidth) / 4), 1.55, 0.085);

/** Seeds of nearby galleries by cell key: an address takes a few milliseconds. */
const seeds = new Map<string, number>();
const seedOf = (cell: Cell, key: string) => {
  let seed = seeds.get(key);
  if (seed === undefined) seeds.set(key, (seed = hashString(addressOf(cell))));
  return seed;
};

interface Mark {
  key: string;
  kind: "ribbon" | "sheet";
  position: THREE.Vector3;
  rotation: number;
}

/** Ribbons in the books that have notes, and a sheet of paper for galleries with notes, in and beside the visitor's gallery. */
function marksNear(online: OnlineStore, place: WorldPlace): Mark[] {
  const marks: Mark[] = [];
  for (let d = -1; d <= 1; d++) {
    const cell = offsetCell(place.cell, d, 0);
    const notes = online.notesAt(cell);
    if (notes.length === 0) continue;
    const col = place.col + d;
    const key = `${cell.x}:${cell.floor}`;
    if (notes.some((n) => !n.anchor)) {
      const position = new THREE.Vector3(...vestibulePoint(col, place.level, SHEET_LOCAL.x, SHEET_LOCAL.y, SHEET_LOCAL.z));
      marks.push({ key: `${key}:sheet`, kind: "sheet", position, rotation: vestibuleFrame(col, place.level).rotation });
    }
    const seen = new Set<string>();
    for (const n of notes) {
      const a = n.anchor;
      if (!a || seen.has(`${a.wall}-${a.shelf}-${a.volume}`)) continue;
      seen.add(`${a.wall}-${a.shelf}-${a.volume}`);
      const b = planBookcase(seedOf(cell, key), a.wall).placements.find((p) => p.shelf === a.shelf && p.volume === a.volume);
      if (!b) continue;
      // Out of the head of the book, down over the spine.
      const local = { x: b.x, y: b.y + (CASE.bookH * b.scaleY) / 2 - 0.04, z: b.z + CASE.bookD / 2 + 0.003 };
      marks.push({ key: `${key}:${a.wall}-${a.shelf}-${a.volume}`, kind: "ribbon", position: bookcaseToWorld(place.level, col, a.wall, local), rotation: bookcaseYaw(a.wall) });
    }
  }
  return marks;
}

/** The notes of the visitor's gallery and its neighbours, as things in the scene. No lights: they only take the gallery's. */
export default function NoteMarks() {
  const online = useOnlineStore();
  const place = useStageSelector((s) => s.place);
  const version = useOnlineSelector((s) => s.notesVersion);
  useEffect(() => {
    if (place) online.watch([...new Set([-1, 0, 1].map((d) => chunkKeyOf(offsetCell(place.cell, d, 0))))]);
  }, [online, place]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` says the notes changed
  const marks = useMemo(() => (place ? marksNear(online, place) : []), [online, place, version]);
  return (
    <>
      {marks.map((m) => (
        <mesh key={m.key} position={m.position} rotation={[0, m.rotation, 0]} geometry={m.kind === "ribbon" ? RIBBON_GEOMETRY : SHEET_GEOMETRY} material={m.kind === "ribbon" ? RIBBON : SHEET} />
      ))}
    </>
  );
}
```

(`CASE` and `planBookcase` live in `bookcasePlan.ts`; check the import path. If ESLint's hooks rule is off for `src/components/explore/**` but not for `src/components/online/**`, keep the disable comment; otherwise drop it.)

- [ ] **Step 4: Mount** — `StageScene.tsx`: `<NoteMarks />` after `<RemotePlayers />`.

- [ ] **Step 5: Verify** — typecheck, lint, test. Chrome: leave a note on a fragment of volume 12 on wall 3, come back to the walk: a red ribbon hangs from that volume's head over its spine; a gallery note puts a paper sheet beside the east doorway. Screenshot both. The light count is unchanged (in the console: `let n = 0; window.__stage` is not the scene — instead compare frame times before and after; the marks add only meshes).

---

### Task 8: Moderation in the interface and refusals

**Files:**
- Modify: `src/components/online/OnlineHud.tsx` (ban button per reader for the admin), `src/components/online/ChatPanel.tsx` (already shows delete/ban; check refusals), the spec (section 9)

- [ ] **Step 1:** In `OnlineHud`, for `admin`, add a small "бан" (`t("ban")` from the `Chat` namespace) button per reader row sending `{ type: "ban", guest: p.id }` after a `window.confirm` with the reader's nick (use `useTranslations("Chat")`).
- [ ] **Step 2:** Refusals: the chat shows `refused` reasons (Task 5 does it while open); also show a refusal for 4 s when the chat is closed (a note composer's send may be refused for `rate`): render `note` under the closed panel when `refused.at` is within 4 s of now.
- [ ] **Step 3: Verify** — typecheck, lint, test; the full smoke from Task 3 once more against the finished UI: as admin, ban the smoke guest from the HUD list; it disappears and cannot reconnect.

---

### Task 9: Docs, memory, the whole thing once more

**Files:**
- Modify: `README.md`, `README.en.md`
- Modify: `C:\Users\user\.claude\projects\C--Users-user-Desktop-work-libraryofbabel\memory\project-online-mode.md` (what was built, traps met)

- [ ] **Step 1:** READMEs: notes (where they show, how to leave one), the chat (T, places, fading), moderation (`/admin <token>`, `ADMIN_TOKEN` in `.env.local`), limits.
- [ ] **Step 2:** Update the memory file with what the implementation taught (anything non-obvious: ports, quirks, decisions changed on the way).
- [ ] **Step 3:** Run everything: `npm run typecheck`, `npm run lint`, `npm test`; in Chrome walk, read, chat, note, map, teleport, with the smoke guest around; then stop the online server and check the solo Library still works with no console errors. Screenshot the map with readers and notes, a gallery with an avatar and a ribbon, and the chat for the user.
- [ ] **Step 4:** Ask the user whether to commit (suggest: protocol + server; chat; notes; 3-D marks + moderation UI; docs), and whether to re-take the README screenshots (the alphabet and the galleries changed in plan 1).
