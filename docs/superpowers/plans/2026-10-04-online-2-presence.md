# Online Library, plan 2 of 4: server, guests, presence, avatars

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visitors of the same Library see each other: a WebSocket server keeps who is where, every tab reports its visitor's pose ten times a second, and the others appear as animated readers in their colours, with a list of who is online and what they read.

**Architecture:** Next.js only signs a guest cookie; a separate `tsx` process (`src/server/index.ts`) accepts WebSockets, keeps one in-memory `World` per language, stores guests and last places in Postgres (docker compose) and broadcasts poses at 10 Hz. A framework-free `onlineStore` on the client (like `stageStore`) holds the roster for React and pose tracks for the render loop; `PresenceReporter` and `RemotePlayers` live inside the canvas.

**Tech Stack:** as plan 1, plus `ws` 8, `postgres` 3 (porsager), dev `tsx` 4 and `@types/ws`; Postgres 17 in Docker.

**Spec:** `docs/superpowers/specs/2026-10-04-online-library-design.md` — sections 3–6 and 10–12. Plan 1 must be done (it provides `src/lib/world.ts`, `WorldPlace.cell`, `galleryCenter(col, level)`).

## Global Constraints

- New dependencies: exactly `ws`, `postgres`, and dev `tsx`, `@types/ws`. Nothing else.
- **No git commits or pushes** unless the user asks; at the end ask whether to commit.
- Never print secrets (`GUEST_SECRET`, `ADMIN_TOKEN`, cookies) in chat or logs.
- The site must work exactly as before when the online server or the database is down (status `offline`, nothing else changes).
- Poses never go through React state: the render loop reads `onlineStore.tracks`; React only re-renders on roster changes (≤ every 2 s).
- The scene's light count stays 11; avatars add no lights.
- Comments: short, why not what, British spelling. Shell: one simple command per call, absolute paths; scripts via the Write tool into the session's scratchpad.
- The user runs `npm run dev` and, from this plan on, `npm run online` in their own terminals; ask them to (re)start `npm run online` when needed. Docker Desktop must be running for `npm run db` — ask the user to start it if `docker ps` fails.
- Every task ends with `npm run typecheck`, `npm run lint`, `npm test` passing.

## Review Focus

- A forged, missing or other-site cookie must not get a socket; a page on another origin must not open one with the visitor's cookie — `verifyGuest` tests (Task 2) and the Origin check (Task 6, smoke test step).
- Garbage, oversized or out-of-range client messages are dropped, never crash the server — `parseClientMessage` tests (Task 3).
- One guest in two tabs: closing one tab must not make them vanish for others — `World` test (Task 5).
- The server going away mid-walk: the client falls back to offline, keeps walking, reconnects with backoff and reappears — `onlineStore` test for `offline` clearing the roster (Task 7) and the manual check in Task 7.
- A remote player on another floor or far along the row is not drawn; a teleporting one snaps instead of sliding through walls — `placeAvatar` tests (Task 8).

## File map

New:
- `docker-compose.yml`, `.env.example`
- `src/server/schema.ts` — SQL run on start (`create … if not exists`)
- `src/server/db.ts` — the Postgres client and queries
- `src/server/guestToken.ts` (+ test) — signed guest cookie, cookie parsing
- `src/server/limits.ts` (+ test) — token buckets
- `src/server/nicks.ts` (+ test) — random nicks
- `src/server/world.ts` (+ test) — players of one language's Library
- `src/server/index.ts` — the WebSocket server
- `src/lib/online/protocol.ts` (+ test) — message types and client-message validation, shared
- `src/app/api/online/guest/route.ts` — sets the guest cookie
- `src/components/online/onlineStore.ts` (+ test), `OnlineProvider.tsx`
- `src/components/online/presence.ts` (+ test) — pure pose maths
- `src/components/online/PresenceReporter.tsx`, `RemotePlayers.tsx` (inside the canvas)
- `src/components/online/OnlineHud.tsx` — who is online, my nick and colour
- `public/models/reader.glb` (+ its licence note in `public/models/README.md`)

Changed: `package.json`, `.gitignore`, `src/app/[locale]/(library)/layout.tsx`, `src/components/explore/stage/{stageStore,Director,StageScene}.tsx?`, the walk page, `messages/{ru,en}.json`, READMEs.

## Task order

1 → 2, 3, 4 (independent) → 5 → 6 → 7 → 8 → 9 → 10.

---

### Task 1: Postgres, environment, scripts

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `src/server/schema.ts`, `src/server/db.ts`
- Modify: `package.json` (dependencies, scripts), `.gitignore`

**Interfaces:**
- Produces: `sql` (postgres client), `migrate(): Promise<void>`, `loadGuest(id, fresh: () => { nick: string; color: string }): Promise<{ nick: string; color: string }>`, `saveProfile(id, nick, color)`, `lastPlace(id, lang): Promise<{ cell: string; wall: number } | null>`, `savePlace(id, lang, cell, wall)`; `SCHEMA: string`.

- [ ] **Step 1: Dependencies** — run `npm install ws postgres`, then `npm install -D tsx @types/ws`. Check `package.json` got `ws`, `postgres`, `tsx`, `@types/ws` and nothing else changed.

- [ ] **Step 2: Scripts** — in `package.json` `scripts` add:

```json
    "db": "docker compose up -d db",
    "online": "tsx watch --env-file=.env.local src/server/index.ts"
```

- [ ] **Step 3: `docker-compose.yml`**

```yaml
# The online Library's database. `npm run db` starts it; data lives in the pgdata volume.
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: babel
      POSTGRES_PASSWORD: babel
      POSTGRES_DB: babel
    ports:
      # 5433 on the host, so a Postgres already installed there keeps its 5432.
      - "127.0.0.1:5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 4: `.env.example`** (and add `!.env.example` under `.env*` in `.gitignore`):

```bash
# Online mode. Copy to .env.local (git-ignored) and put long random strings in the secrets:
#   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
DATABASE_URL=postgres://babel:babel@localhost:5433/babel
GUEST_SECRET=
ADMIN_TOKEN=
WS_PORT=3001
# Where browsers reach the online server when it is not ws://<page host>:3001 (behind a proxy: wss://example.org/ws).
# NEXT_PUBLIC_WS_URL=
# Behind a reverse proxy that sets X-Forwarded-For.
# TRUST_PROXY=1
```

Create `.env.local` from it (if it does not exist) with freshly generated secrets — generate them with the command above, write the file with the Write tool, never echo the values.

- [ ] **Step 5: `src/server/schema.ts`**

```ts
/** What the online server needs in Postgres; run on every start, so every statement must be repeatable. */
export const SCHEMA = `
create table if not exists guests (
  id uuid primary key,
  nick text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create table if not exists positions (
  guest uuid not null references guests(id),
  lang text not null,
  cell text not null,
  wall int not null,
  updated_at timestamptz not null default now(),
  primary key (guest, lang)
);
`;
```

- [ ] **Step 6: `src/server/db.ts`**

```ts
import postgres from "postgres";
import { SCHEMA } from "./schema";

/** The online server's only connection pool. */
export const sql = postgres(process.env.DATABASE_URL ?? "postgres://babel:babel@localhost:5433/babel", {
  max: 5,
  onnotice: () => {},
});

export async function migrate(): Promise<void> {
  await sql.unsafe(SCHEMA);
}

/** The guest's nick and colour, made up by `fresh` the first time the guest is seen. */
export async function loadGuest(id: string, fresh: () => { nick: string; color: string }): Promise<{ nick: string; color: string }> {
  const { nick, color } = fresh();
  // "do update" (to itself) rather than "do nothing", so that the row comes back either way.
  const [row] = await sql<{ nick: string; color: string }[]>`
    insert into guests (id, nick, color) values (${id}, ${nick}, ${color})
    on conflict (id) do update set id = excluded.id
    returning nick, color`;
  return row;
}

export async function saveProfile(id: string, nick: string, color: string): Promise<void> {
  await sql`update guests set nick = ${nick}, color = ${color} where id = ${id}`;
}

/** The gallery a guest was last in, in one language's Library. */
export async function lastPlace(id: string, lang: string): Promise<{ cell: string; wall: number } | null> {
  const [row] = await sql<{ cell: string; wall: number }[]>`select cell, wall from positions where guest = ${id} and lang = ${lang}`;
  return row ?? null;
}

export async function savePlace(id: string, lang: string, cell: string, wall: number): Promise<void> {
  await sql`
    insert into positions (guest, lang, cell, wall) values (${id}, ${lang}, ${cell}, ${wall})
    on conflict (guest, lang) do update set cell = excluded.cell, wall = excluded.wall, updated_at = now()`;
}
```

- [ ] **Step 7: Verify** — `docker ps` (if it fails, ask the user to start Docker Desktop), `npm run db`, then `docker compose ps` shows `db` running. `npm run typecheck`, `npm run lint`, `npm test`.

---

### Task 2: The guest cookie

**Files:**
- Create: `src/server/guestToken.ts`, `src/server/guestToken.test.ts`, `src/app/api/online/guest/route.ts`

**Interfaces:**
- Produces: `GUEST_COOKIE = "babel_guest"`, `newGuestId(): string`, `signGuest(id, secret): string`, `verifyGuest(token: string | undefined, secret): string | null`, `readCookie(header: string | undefined, name): string | undefined`; `POST /api/online/guest` → `{ online: boolean }` and the cookie.

- [ ] **Step 1: Failing tests** — `src/server/guestToken.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newGuestId, readCookie, signGuest, verifyGuest } from "./guestToken";

const SECRET = "test-secret";

describe("guest tokens", () => {
  it("name the guest they were signed for", () => {
    const id = newGuestId();
    expect(verifyGuest(signGuest(id, SECRET), SECRET)).toBe(id);
  });

  it("refuse a forged, altered, foreign or missing token", () => {
    const id = newGuestId();
    const token = signGuest(id, SECRET);
    expect(verifyGuest(undefined, SECRET)).toBeNull();
    expect(verifyGuest("", SECRET)).toBeNull();
    expect(verifyGuest(`${id}.forged`, SECRET)).toBeNull();
    expect(verifyGuest(token.replace(id, newGuestId()), SECRET)).toBeNull();
    expect(verifyGuest(token, "another-secret")).toBeNull();
    expect(verifyGuest(`not-a-uuid.${token.split(".")[1]}`, SECRET)).toBeNull();
  });

  it("are found among the cookies of a request", () => {
    expect(readCookie("a=1; babel_guest=x.y; b=2", "babel_guest")).toBe("x.y");
    expect(readCookie("babel_guest_old=z", "babel_guest")).toBeUndefined();
    expect(readCookie(undefined, "babel_guest")).toBeUndefined();
  });
});
```

Run `npm test -- src/server/guestToken.test.ts` → FAIL (no module).

- [ ] **Step 2: `src/server/guestToken.ts`**

```ts
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/** The cookie that tells the online server who a browser is. httpOnly: page scripts never see it. */
export const GUEST_COOKIE = "babel_guest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const mac = (id: string, secret: string) => createHmac("sha256", secret).update(id).digest("base64url");

export const newGuestId = (): string => randomUUID();

/** "<id>.<signature>": Next.js signs it, the online server checks it, and neither needs the other's database. */
export const signGuest = (id: string, secret: string): string => `${id}.${mac(id, secret)}`;

export function verifyGuest(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const [id, signature, extra] = token.split(".");
  if (!id || !signature || extra !== undefined || !UUID.test(id)) return null;
  const want = Buffer.from(mac(id, secret));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

/** One cookie out of a Cookie header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
```

Run the test → PASS.

- [ ] **Step 3: The route** — `src/app/api/online/guest/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GUEST_COOKIE, newGuestId, signGuest, verifyGuest } from "@/server/guestToken";

export const runtime = "nodejs";

/**
 * Gives the browser a guest of its own, or keeps the one it has. Without a GUEST_SECRET there is no online mode, and
 * the page stays solo.
 */
export async function POST() {
  const secret = process.env.GUEST_SECRET;
  if (!secret) return NextResponse.json({ online: false }, { status: 503 });
  const jar = await cookies();
  if (!verifyGuest(jar.get(GUEST_COOKIE)?.value, secret)) {
    jar.set(GUEST_COOKIE, signGuest(newGuestId(), secret), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return NextResponse.json({ online: true });
}
```

- [ ] **Step 4: Verify** — typecheck, lint, test. Check that `src/proxy.ts` does not intercept `/api/online/guest` (read its matcher; it must only handle `/`). In Chrome on the dev site: `await fetch("/api/online/guest", {method: "POST"}).then(r => r.json())` → `{online: true}` (after the user restarts `npm run dev` so it reads `.env.local`), and `document.cookie` does **not** contain `babel_guest` (httpOnly).

---

### Task 3: The protocol

**Files:**
- Create: `src/lib/online/protocol.ts`, `src/lib/online/protocol.test.ts`

**Interfaces:**
- Produces: `View`, `Pose`, `Player`, `ClientMessage`, `ServerMessage`, `PLAYER_COLORS`, `cleanNick(raw): string | null`, `cleanColor(raw): string | null`, `parseClientMessage(raw: string): ClientMessage | null`, `MAX_FRAME`. Plans 3 and 4 add members to the two unions and cases to `parseClientMessage`.

- [ ] **Step 1: Failing tests** — `src/lib/online/protocol.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanColor, cleanNick, parseClientMessage } from "./protocol";

const pose = { type: "pose", cell: "3:-2", p: [1.2, 1.6, -0.4], yaw: 0.5, view: { kind: "walk", wall: 2 } };
const parse = (m: unknown) => parseClientMessage(JSON.stringify(m));

describe("client messages", () => {
  it("take a hello in a known language", () => {
    expect(parse({ type: "hello", lang: "ru" })).toEqual({ type: "hello", lang: "ru" });
    expect(parse({ type: "hello", lang: "de" })).toBeNull();
  });

  it("take a pose and every kind of view", () => {
    expect(parse(pose)).toEqual(pose);
    expect(parse({ ...pose, view: { kind: "shelf", wall: 4, shelf: 7 } })).not.toBeNull();
    expect(parse({ ...pose, view: { kind: "desk", wall: 1, shelf: 1, volume: 31, page: 420 } })).not.toBeNull();
  });

  it("drop poses out of range or out of shape", () => {
    expect(parse({ ...pose, cell: "3" })).toBeNull();
    expect(parse({ ...pose, p: [1, 2] })).toBeNull();
    expect(parse({ ...pose, p: [1, 2, 1e9] })).toBeNull();
    expect(parse({ ...pose, yaw: "north" })).toBeNull();
    expect(parse({ ...pose, view: { kind: "walk", wall: 5 } })).toBeNull();
    expect(parse({ ...pose, view: { kind: "desk", wall: 1, shelf: 1, volume: 32, page: 0 } })).toBeNull();
  });

  it("take a profile with a clean nick or colour", () => {
    expect(parse({ type: "profile", nick: "  Тихий   читатель " })).toEqual({ type: "profile", nick: "Тихий читатель" });
    expect(parse({ type: "profile", color: "#B02E3A" })).toEqual({ type: "profile", color: "#b02e3a" });
    expect(parse({ type: "profile" })).toBeNull();
    expect(parse({ type: "profile", nick: "x" })).toBeNull();
  });

  it("drop what is not JSON, too big or unknown", () => {
    expect(parseClientMessage("{")).toBeNull();
    expect(parseClientMessage("null")).toBeNull();
    expect(parse({ type: "explode" })).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...pose, pad: "x".repeat(70_000) }))).toBeNull();
  });
});

describe("profiles", () => {
  it("keep nicks of 2..24 printable characters", () => {
    expect(cleanNick("ab")).toBe("ab");
    expect(cleanNick("a".repeat(25))).toBeNull();
    expect(cleanNick("bad\u0007bell")).toBeNull();
    expect(cleanNick(42)).toBeNull();
  });

  it("keep #rrggbb colours only", () => {
    expect(cleanColor("#00ff00")).toBe("#00ff00");
    expect(cleanColor("red")).toBeNull();
    expect(cleanColor("#0f0")).toBeNull();
  });
});
```

Run → FAIL.

- [ ] **Step 2: `src/lib/online/protocol.ts`**

```ts
import { isLocale, type Locale } from "@/i18n/locales";
import { LIBRARY } from "@/lib/library";
import { parseCellKey } from "@/lib/world";

/*
 * What the browser and the online server say to each other, as JSON text frames. Shared by both sides; the server
 * trusts nothing a client sends until `parseClientMessage` has checked it. Cells travel as keys ("x:floor").
 */

/** What a visitor is doing: walking (and facing wall 1..4, or 0 for a doorway), at a shelf, or reading at a desk. */
export type View =
  | { kind: "walk"; wall: number }
  | { kind: "shelf"; wall: number; shelf: number }
  | { kind: "desk"; wall: number; shelf: number; volume: number; page: number };

/** A visitor's place: their gallery, their eye in it (metres from its centre), where they look, what they do. */
export interface Pose {
  cell: string;
  p: [number, number, number];
  yaw: number;
  view: View;
}

export interface Player extends Pose {
  id: string;
  nick: string;
  color: string;
}

export type ClientMessage = { type: "hello"; lang: Locale; admin?: string } | ({ type: "pose" } & Pose) | { type: "profile"; nick?: string; color?: string };

export type ServerMessage =
  | { type: "welcome"; you: { id: string; nick: string; color: string }; last: { cell: string; wall: number } | null; admin: boolean }
  | { type: "players"; list: Player[] }
  | { type: "poses"; list: ({ id: string } & Pose)[] }
  | { type: "left"; id: string };

/** The colours a new guest is given (the fragment swatches). */
export const PLAYER_COLORS = ["#b02e3a", "#d9722b", "#c9a227", "#4f9a5a", "#2e8f9e", "#3a6fc4", "#7b52c7", "#c24d9a"] as const;

/** Longest client frame, in characters. */
export const MAX_FRAME = 64 * 1024;

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isNum = (v: unknown, limit: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;

/** A nick of 2..24 printable characters, whitespace collapsed. */
export function cleanNick(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const nick = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  return nick.length >= 2 && nick.length <= 24 && !/\p{Cc}/u.test(nick) ? nick : null;
}

export function cleanColor(raw: unknown): string | null {
  return typeof raw === "string" && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
}

function parseView(v: unknown): View | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "walk") return isInt(o.wall, 0, LIBRARY.walls) ? { kind: "walk", wall: o.wall } : null;
  if (!isInt(o.wall, 1, LIBRARY.walls) || !isInt(o.shelf, 1, LIBRARY.shelves)) return null;
  if (o.kind === "shelf") return { kind: "shelf", wall: o.wall, shelf: o.shelf };
  if (o.kind === "desk" && isInt(o.volume, 1, LIBRARY.volumes) && isInt(o.page, 0, LIBRARY.pages)) {
    return { kind: "desk", wall: o.wall, shelf: o.shelf, volume: o.volume, page: o.page };
  }
  return null;
}

/** A gallery-local eye is never far from its gallery's centre (a vestibule and a stair turn at most). */
const LOCAL_LIMIT = 50;

export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_FRAME) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  switch (o.type) {
    case "hello": {
      if (!isLocale(o.lang)) return null;
      return typeof o.admin === "string" && o.admin.length <= 200 ? { type: "hello", lang: o.lang, admin: o.admin } : { type: "hello", lang: o.lang };
    }
    case "pose": {
      const view = parseView(o.view);
      const p = o.p;
      if (typeof o.cell !== "string" || !parseCellKey(o.cell) || !view || !isNum(o.yaw, 10)) return null;
      if (!Array.isArray(p) || p.length !== 3 || !p.every((n) => isNum(n, LOCAL_LIMIT))) return null;
      return { type: "pose", cell: o.cell, p: [p[0], p[1], p[2]], yaw: o.yaw, view };
    }
    case "profile": {
      const nick = o.nick === undefined ? undefined : cleanNick(o.nick);
      const color = o.color === undefined ? undefined : cleanColor(o.color);
      if (nick === null || color === null || (nick === undefined && color === undefined)) return null;
      return { type: "profile", ...(nick !== undefined && { nick }), ...(color !== undefined && { color }) };
    }
  }
  return null;
}
```

(`yaw` is sent wrapped to (−π, π], hence the limit of 10.)

Run → PASS.

- [ ] **Step 3: Verify** — typecheck, lint, test.

---

### Task 4: Rate limits and nicks

**Files:**
- Create: `src/server/limits.ts`, `src/server/limits.test.ts`, `src/server/nicks.ts`, `src/server/nicks.test.ts`

**Interfaces:**
- Produces: `class Bucket { constructor(perSecond: number, burst: number, now?: () => number); take(): boolean }`; `randomNick(lang: Locale, random?: () => number): string`, `randomColor(random?: () => number): string`.

- [ ] **Step 1: Failing tests** — `src/server/limits.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Bucket } from "./limits";

describe("Bucket", () => {
  it("allows a burst, then one per interval", () => {
    let t = 0;
    const bucket = new Bucket(0.5, 3, () => t);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false]);
    t = 1000;
    expect(bucket.take()).toBe(false);
    t = 2000;
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });

  it("never saves up more than its burst", () => {
    let t = 0;
    const bucket = new Bucket(10, 2, () => t);
    t = 60_000;
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
  });
});
```

`src/server/nicks.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanNick, PLAYER_COLORS } from "@/lib/online/protocol";
import { randomColor, randomNick } from "./nicks";

describe("random nicks", () => {
  it("are valid nicks in the visitor's language", () => {
    for (let i = 0; i < 50; i++) {
      expect(cleanNick(randomNick("ru"))).toMatch(/^[А-ЯЁ][а-яё]+ [а-яё]+$/);
      expect(cleanNick(randomNick("en"))).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
    }
  });

  it("come with one of the player colours", () => {
    expect(PLAYER_COLORS).toContain(randomColor());
  });
});
```

Run both → FAIL.

- [ ] **Step 2: `src/server/limits.ts`**

```ts
/** A token bucket: `burst` tokens to start with, refilled at `perSecond`; take() spends one if there is one. */
export class Bucket {
  private tokens: number;
  private at: number;

  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now
  ) {
    this.tokens = burst;
    this.at = now();
  }

  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.at) / 1000) * this.perSecond);
    this.at = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
```

- [ ] **Step 3: `src/server/nicks.ts`**

```ts
import type { Locale } from "@/i18n/locales";
import { PLAYER_COLORS } from "@/lib/online/protocol";

/** Adjective and noun, both masculine in Russian so that they agree. */
const WORDS: Record<Locale, [string[], string[]]> = {
  ru: [
    ["Тихий", "Седой", "Ночной", "Пыльный", "Бледный", "Странствующий", "Безмолвный", "Усталый", "Зоркий", "Забытый"],
    ["читатель", "библиотекарь", "паломник", "переплётчик", "толкователь", "странник", "искатель", "хранитель", "писец", "путник"],
  ],
  en: [
    ["Quiet", "Grey", "Nocturnal", "Dusty", "Pale", "Wandering", "Silent", "Weary", "Keen", "Forgotten"],
    ["reader", "librarian", "pilgrim", "binder", "exegete", "wanderer", "seeker", "keeper", "scribe", "traveller"],
  ],
};

const pick = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)];

/** A nick for a new guest, in the language of the Library they came to first. */
export function randomNick(lang: Locale, random: () => number = Math.random): string {
  const [adjectives, nouns] = WORDS[lang];
  return `${pick(adjectives, random)} ${pick(nouns, random)}`;
}

export const randomColor = (random: () => number = Math.random): string => pick(PLAYER_COLORS, random);
```

Run the tests → PASS. Then typecheck, lint, test.

---

### Task 5: A world's players

**Files:**
- Create: `src/server/world.ts`, `src/server/world.test.ts`

**Interfaces:**
- Consumes: `Player`, `Pose`, `ServerMessage` (Task 3).
- Produces: `class World { readonly players: Map<string, Player>; join(player: Player): boolean; leave(id: string): boolean; move(id: string, pose: Pose): void; rename(id: string, nick: string, color: string): void; takeMoves(): ServerMessage | null; roster(): ServerMessage }` — `join` returns true when the guest was not in the world yet; `leave` returns true when their last tab left.

- [ ] **Step 1: Failing tests** — `src/server/world.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Player, Pose } from "@/lib/online/protocol";
import { World } from "./world";

const pose = (x: number): Pose => ({ cell: "0:0", p: [x, 1.6, 0], yaw: 0, view: { kind: "walk", wall: 1 } });
const player = (id: string, x = 0): Player => ({ id, nick: id, color: "#b02e3a", ...pose(x) });

describe("World", () => {
  it("lists who joined and sends only the poses that changed, once", () => {
    const world = new World();
    expect(world.join(player("a"))).toBe(true);
    world.join(player("b"));
    world.takeMoves();
    world.move("a", pose(2));
    expect(world.takeMoves()).toEqual({ type: "poses", list: [{ id: "a", ...pose(2) }] });
    expect(world.takeMoves()).toBeNull();
    expect(world.roster()).toMatchObject({ type: "players", list: [{ id: "a" }, { id: "b" }] });
  });

  it("keeps a guest with two tabs until the last one leaves", () => {
    const world = new World();
    world.join(player("a"));
    expect(world.join(player("a", 3))).toBe(false);
    expect(world.leave("a")).toBe(false);
    expect(world.players.has("a")).toBe(true);
    expect(world.leave("a")).toBe(true);
    expect(world.players.has("a")).toBe(false);
  });

  it("forgets the moves of someone who left", () => {
    const world = new World();
    world.join(player("a"));
    world.leave("a");
    expect(world.takeMoves()).toBeNull();
  });

  it("renames", () => {
    const world = new World();
    world.join(player("a"));
    world.rename("a", "Тихий читатель", "#4f9a5a");
    expect(world.players.get("a")).toMatchObject({ nick: "Тихий читатель", color: "#4f9a5a" });
  });
});
```

Run → FAIL.

- [ ] **Step 2: `src/server/world.ts`**

```ts
import type { Player, Pose, ServerMessage } from "@/lib/online/protocol";

/**
 * Everyone in one language's Library, in memory: what they look like, where they are, and who moved since the last
 * tick. A guest may have several tabs open; they are one player, gone when the last tab goes.
 */
export class World {
  readonly players = new Map<string, Player>();
  private readonly tabs = new Map<string, number>();
  private readonly moved = new Set<string>();

  join(player: Player): boolean {
    const tabs = this.tabs.get(player.id) ?? 0;
    this.tabs.set(player.id, tabs + 1);
    this.players.set(player.id, player);
    this.moved.add(player.id);
    return tabs === 0;
  }

  leave(id: string): boolean {
    const tabs = (this.tabs.get(id) ?? 0) - 1;
    if (tabs > 0) {
      this.tabs.set(id, tabs);
      return false;
    }
    this.tabs.delete(id);
    this.moved.delete(id);
    return this.players.delete(id);
  }

  move(id: string, pose: Pose): void {
    const player = this.players.get(id);
    if (!player) return;
    Object.assign(player, pose);
    this.moved.add(id);
  }

  rename(id: string, nick: string, color: string): void {
    const player = this.players.get(id);
    if (player) Object.assign(player, { nick, color });
  }

  /** The poses of everyone who moved since the last call. */
  takeMoves(): ServerMessage | null {
    if (this.moved.size === 0) return null;
    const list = [...this.moved].flatMap((id) => {
      const p = this.players.get(id);
      return p ? [{ id, cell: p.cell, p: p.p, yaw: p.yaw, view: p.view }] : [];
    });
    this.moved.clear();
    return list.length ? { type: "poses", list } : null;
  }

  roster(): ServerMessage {
    return { type: "players", list: [...this.players.values()] };
  }
}
```

Run → PASS; then typecheck, lint, test.

---

### Task 6: The online server

**Files:**
- Create: `src/server/index.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: a WebSocket endpoint on `WS_PORT` (3001): upgrade needs a valid `babel_guest` cookie and an `Origin` whose host name is the request's host name; first message must be `hello`; then `pose`/`profile`. Sends `welcome`, `players` (on hello, on every join/leave/rename, every 2 s), `poses` (10 Hz), `left`.

- [ ] **Step 1: Write `src/server/index.ts`**

```ts
import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { locales, type Locale } from "@/i18n/locales";
import { parseClientMessage, type ClientMessage, type Pose, type ServerMessage } from "@/lib/online/protocol";
import { lastPlace, loadGuest, migrate, saveProfile, savePlace } from "./db";
import { GUEST_COOKIE, readCookie, verifyGuest } from "./guestToken";
import { Bucket } from "./limits";
import { randomColor, randomNick } from "./nicks";
import { World } from "./world";

const PORT = Number(process.env.WS_PORT ?? 3001);
const SECRET = process.env.GUEST_SECRET ?? "";
const ADMIN = process.env.ADMIN_TOKEN ?? "";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
if (!SECRET) throw new Error("GUEST_SECRET is not set: copy .env.example to .env.local");

/** One open socket: a tab of a guest, in the Library its hello named. */
interface Client {
  ws: WebSocket;
  guest: string;
  ip: string;
  lang: Locale | null;
  nick: string;
  color: string;
  admin: boolean;
  /** Whether the guest is in the world (after their first pose). */
  joined: boolean;
  place: { cell: string; wall: number } | null;
  placeSavedAt: number;
  poses: Bucket;
  profiles: Bucket;
}

const worlds = new Map<Locale, World>(locales.map((lang) => [lang, new World()]));
const clients = new Map<Locale, Set<Client>>(locales.map((lang) => [lang, new Set<Client>()]));

function send(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(lang: Locale, message: ServerMessage) {
  const data = JSON.stringify(message);
  for (const c of clients.get(lang)!) if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
}

function addressOf(req: IncomingMessage): string {
  const forwarded = TRUST_PROXY ? req.headers["x-forwarded-for"]?.toString().split(",")[0] : undefined;
  return (forwarded ?? req.socket.remoteAddress ?? "").trim();
}

/** The page that opens the socket must be served from this host: another site cannot borrow a visitor's cookie. */
function sameHost(req: IncomingMessage): boolean {
  try {
    return new URL(req.headers.origin ?? "").hostname === (req.headers.host ?? "").split(":")[0];
  } catch {
    return false;
  }
}

/** Where a pose says the guest stands, for the next visit: their gallery and the wall they face or read. */
const placeOf = (pose: Pose) => ({ cell: pose.cell, wall: pose.view.wall || 1 });

async function hello(c: Client, lang: Locale, admin: string | undefined) {
  const { nick, color } = await loadGuest(c.guest, () => ({ nick: randomNick(lang), color: randomColor() }));
  const last = await lastPlace(c.guest, lang);
  Object.assign(c, { lang, nick, color, admin: ADMIN !== "" && admin === ADMIN });
  clients.get(lang)!.add(c);
  send(c.ws, { type: "welcome", you: { id: c.guest, nick, color }, last, admin: c.admin });
  send(c.ws, worlds.get(lang)!.roster());
}

async function handle(c: Client, m: ClientMessage) {
  if (m.type === "hello") {
    if (!c.lang) await hello(c, m.lang, m.admin);
    return;
  }
  const lang = c.lang;
  if (!lang) return;
  const world = worlds.get(lang)!;

  if (m.type === "pose") {
    if (!c.poses.take()) return;
    const pose: Pose = { cell: m.cell, p: m.p, yaw: m.yaw, view: m.view };
    if (!c.joined) {
      c.joined = true;
      if (world.join({ id: c.guest, nick: c.nick, color: c.color, ...pose })) broadcast(lang, world.roster());
    } else world.move(c.guest, pose);
    c.place = placeOf(pose);
    if (Date.now() - c.placeSavedAt > 5000) {
      c.placeSavedAt = Date.now();
      await savePlace(c.guest, lang, c.place.cell, c.place.wall);
    }
    return;
  }

  if (m.type === "profile") {
    if (!c.profiles.take()) return;
    c.nick = m.nick ?? c.nick;
    c.color = m.color ?? c.color;
    await saveProfile(c.guest, c.nick, c.color);
    for (const other of clients.get(lang)!) if (other.guest === c.guest) Object.assign(other, { nick: c.nick, color: c.color });
    world.rename(c.guest, c.nick, c.color);
    broadcast(lang, world.roster());
  }
}

function left(c: Client) {
  const lang = c.lang;
  if (!lang) return;
  clients.get(lang)!.delete(c);
  if (c.joined && worlds.get(lang)!.leave(c.guest)) broadcast(lang, { type: "left", id: c.guest });
  if (c.place) savePlace(c.guest, lang, c.place.cell, c.place.wall).catch((e) => console.error("save place", e));
}

function connected(ws: WebSocket, guest: string, ip: string) {
  const c: Client = {
    ws,
    guest,
    ip,
    lang: null,
    nick: "",
    color: "",
    admin: false,
    joined: false,
    place: null,
    placeSavedAt: 0,
    // A client reports at most ten poses a second; a little slack for jitter.
    poses: new Bucket(12, 12),
    profiles: new Bucket(0.2, 2),
  };
  let alive = true;
  ws.on("pong", () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 30_000);
  ws.on("message", (data) => {
    const m = parseClientMessage(data.toString());
    if (m) handle(c, m).catch((e) => console.error("message", e));
  });
  ws.on("close", () => {
    clearInterval(heartbeat);
    left(c);
  });
}

const http = createServer((_, res) => res.writeHead(426).end("This port speaks WebSocket only."));
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

http.on("upgrade", (req, socket, head) => {
  const guest = verifyGuest(readCookie(req.headers.cookie, GUEST_COOKIE), SECRET);
  if (!guest || !sameHost(req)) {
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => connected(ws, guest, addressOf(req)));
});

// Poses ten times a second, the full roster every two (it also carries what everyone reads).
setInterval(() => {
  for (const [lang, world] of worlds) {
    const moves = world.takeMoves();
    if (moves) broadcast(lang, moves);
  }
}, 100);
setInterval(() => {
  for (const [lang, world] of worlds) if (world.players.size) broadcast(lang, world.roster());
}, 2000);

// No top-level await: without "type": "module" in package.json tsx runs this file as CommonJS.
migrate()
  .then(() => http.listen(PORT, () => console.log(`online Library on :${PORT}`)))
  .catch((e) => {
    console.error("cannot reach the database (is `npm run db` up?)", e);
    process.exit(1);
  });
```

- [ ] **Step 2: Smoke test** — ask the user to run `npm run online` in a terminal (Postgres up). Write `smoke-online.mjs` into the scratchpad:

```js
// Connects as a made-up guest, says hello, walks one step, prints what comes back. Reads GUEST_SECRET from .env.local.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import WebSocket from "C:/Users/user/Desktop/work/libraryofbabel/node_modules/ws/wrapper.mjs";

const env = Object.fromEntries(
  readFileSync("C:/Users/user/Desktop/work/libraryofbabel/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const id = randomUUID();
const cookie = `babel_guest=${id}.${createHmac("sha256", env.GUEST_SECRET).update(id).digest("base64url")}`;
const open = (origin) => new WebSocket("ws://localhost:3001", { headers: { cookie, origin } });

const foreign = open("http://evil.test");
foreign.on("error", (e) => console.log("foreign origin refused:", e.message));

const ws = open("http://localhost:3000");
ws.on("open", () => {
  ws.send(JSON.stringify({ type: "hello", lang: "ru" }));
  ws.send(JSON.stringify({ type: "pose", cell: "0:0", p: [2, 1.6, 0], yaw: 0, view: { kind: "walk", wall: 1 } }));
  ws.send("garbage");
});
ws.on("message", (d) => console.log(String(d).slice(0, 200)));
setTimeout(() => process.exit(0), 2500);
```

Run it with `node <scratchpad>/smoke-online.mjs`. Expected: "foreign origin refused: Unexpected server response: 403", a `welcome` with a Russian nick, a `players` roster containing this guest, a `poses` frame — and the server keeps running (garbage dropped). Run it twice: the second run's `welcome` has `last: {cell: "0:0", wall: 1}`.

- [ ] **Step 3: Verify** — typecheck, lint, test.

---

### Task 7: The client's connection and store

**Files:**
- Create: `src/components/online/presence.ts` (only the `Track`/`Sample` types and `addSample` in this task; Task 8 fills the rest), `src/components/online/onlineStore.ts`, `src/components/online/onlineStore.test.ts`, `src/components/online/OnlineProvider.tsx`
- Modify: `src/app/[locale]/(library)/layout.tsx`

**Interfaces:**
- Produces:
  - `interface Sample { t: number; cell: Cell; p: [number, number, number]; yaw: number; view: View }`, `type Track = Sample[]`, `addSample(track: Track, sample: Sample): void` (keeps the last 4)
  - `type OnlineStatus = "connecting" | "online" | "offline"`
  - `interface OnlineSnapshot { status; you: { id; nick; color } | null; last: { cell: string; wall: number } | null; admin: boolean; players: ReadonlyMap<string, Player> }` (players: everyone but me)
  - `interface OnlineStore { getSnapshot(); subscribe(listener); setStatus(status); receive(message: ServerMessage, now?: number); send(message: ClientMessage): void; tracks: Map<string, Track> }`, `createOnlineStore(): OnlineStore`
  - `OnlineProvider`, `useOnlineStore(): OnlineStore`, `useOnlineSelector<T>(select: (s: OnlineSnapshot) => T): T`

- [ ] **Step 1: Types for tracks** — `src/components/online/presence.ts`:

```ts
import type { View } from "@/lib/online/protocol";
import type { Cell } from "@/lib/world";

/** A pose of another visitor as it arrived (t: performance.now() at arrival). */
export interface Sample {
  t: number;
  cell: Cell;
  p: [number, number, number];
  yaw: number;
  view: View;
}

/** The last few poses of one visitor, oldest first. */
export type Track = Sample[];

const TRACK_LENGTH = 4;

export function addSample(track: Track, sample: Sample): void {
  track.push(sample);
  if (track.length > TRACK_LENGTH) track.shift();
}
```

- [ ] **Step 2: Failing tests** — `src/components/online/onlineStore.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Player } from "@/lib/online/protocol";
import { createOnlineStore } from "./onlineStore";

const me = { id: "me", nick: "Я", color: "#b02e3a" };
const other = (id: string): Player => ({ id, nick: id, color: "#4f9a5a", cell: "1:2", p: [0, 1.6, 0], yaw: 0, view: { kind: "walk", wall: 1 } });

describe("onlineStore", () => {
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
```

Run → FAIL.

- [ ] **Step 3: `src/components/online/onlineStore.ts`**

```ts
import type { ClientMessage, Player, ServerMessage } from "@/lib/online/protocol";
import { parseCellKey } from "@/lib/world";
import { addSample, type Track } from "./presence";

export type OnlineStatus = "connecting" | "online" | "offline";

export interface OnlineSnapshot {
  status: OnlineStatus;
  you: { id: string; nick: string; color: string } | null;
  /** The gallery the server remembers this guest in, in this Library. */
  last: { cell: string; wall: number } | null;
  admin: boolean;
  /** Everyone else in this Library, as of the last roster (on joins, leaves and renames, and every 2 s). */
  players: ReadonlyMap<string, Player>;
}

export interface OnlineStore {
  getSnapshot(): OnlineSnapshot;
  subscribe(listener: () => void): () => void;
  setStatus(status: OnlineStatus): void;
  receive(message: ServerMessage, now?: number): void;
  /** Sends a message while connected; replaced by the connection, a no-op without one. */
  send(message: ClientMessage): void;
  /** Recent poses of the others for the render loop: ten updates a second, none of them re-renders anything. */
  tracks: Map<string, Track>;
}

const NOBODY: ReadonlyMap<string, Player> = new Map();

export function createOnlineStore(): OnlineStore {
  let snapshot: OnlineSnapshot = { status: "connecting", you: null, last: null, admin: false, players: NOBODY };
  const listeners = new Set<() => void>();
  const tracks = new Map<string, Track>();
  const set = (next: Partial<OnlineSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((l) => l());
  };
  const track = (id: string, pose: Pick<Player, "cell" | "p" | "yaw" | "view">, now: number) => {
    const cell = parseCellKey(pose.cell);
    if (!cell) return;
    let t = tracks.get(id);
    if (!t) tracks.set(id, (t = []));
    addSample(t, { t: now, cell, p: pose.p, yaw: pose.yaw, view: pose.view });
  };

  const store: OnlineStore = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setStatus(status) {
      if (status === snapshot.status) return;
      if (status === "offline") {
        tracks.clear();
        set({ status, players: NOBODY });
      } else set({ status });
    },
    receive(m, now = performance.now()) {
      const me = snapshot.you?.id;
      switch (m.type) {
        case "welcome":
          set({ status: "online", you: m.you, last: m.last, admin: m.admin });
          return;
        case "players": {
          const players = new Map(m.list.filter((p) => p.id !== me).map((p) => [p.id, p]));
          for (const p of players.values()) if (!tracks.has(p.id)) track(p.id, p, now);
          for (const id of tracks.keys()) if (!players.has(id)) tracks.delete(id);
          set({ players });
          return;
        }
        case "poses":
          for (const pose of m.list) if (pose.id !== me && snapshot.players.has(pose.id)) track(pose.id, pose, now);
          return;
        case "left": {
          tracks.delete(m.id);
          if (!snapshot.players.has(m.id)) return;
          const players = new Map(snapshot.players);
          players.delete(m.id);
          set({ players });
          return;
        }
      }
    },
    send: () => {},
    tracks,
  };
  return store;
}
```

Run the tests → PASS.

- [ ] **Step 4: `src/components/online/OnlineProvider.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale } from "next-intl";
import type { ClientMessage, ServerMessage } from "@/lib/online/protocol";
import { createOnlineStore, type OnlineSnapshot, type OnlineStore } from "./onlineStore";

const OnlineContext = createContext<OnlineStore | null>(null);

/** Where the online server is: NEXT_PUBLIC_WS_URL, or port 3001 of the host that served the page. */
function serverUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3001`;
}

/**
 * Keeps this tab connected to the online Library of the page's language: gets a guest cookie, opens the socket, says
 * hello, and tries again after 1, 2, 4 … 30 s whenever it fails or drops. Offline, the Library is simply solo.
 */
export function OnlineProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [store] = useState(createOnlineStore);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const again = () => {
      store.setStatus("offline");
      store.send = () => {};
      if (!stopped) timer = setTimeout(open, Math.min(30_000, 1000 * 2 ** retry++));
    };

    async function open() {
      store.setStatus("connecting");
      try {
        const res = await fetch("/api/online/guest", { method: "POST" });
        if (!res.ok) return again();
      } catch {
        return again();
      }
      if (stopped) return;
      const socket = new WebSocket(serverUrl());
      ws = socket;
      socket.onopen = () => {
        retry = 0;
        const hello: ClientMessage = { type: "hello", lang: isLocale(locale) ? locale : defaultLocale };
        socket.send(JSON.stringify(hello));
        store.send = (m) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m));
        };
      };
      socket.onmessage = (e) => store.receive(JSON.parse(e.data as string) as ServerMessage);
      socket.onclose = () => {
        if (ws === socket) again();
      };
    }

    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
      store.setStatus("offline");
    };
  }, [store, locale]);

  return <OnlineContext.Provider value={store}>{children}</OnlineContext.Provider>;
}

export function useOnlineStore(): OnlineStore {
  const store = useContext(OnlineContext);
  if (!store) throw new Error("useOnlineStore outside OnlineProvider");
  return store;
}

export function useOnlineSelector<T>(select: (s: OnlineSnapshot) => T): T {
  const store = useOnlineStore();
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()), () => select(store.getSnapshot()));
}
```

(Add `import { defaultLocale, isLocale } from "@/i18n/locales";`.)

- [ ] **Step 5: Layout** — `src/app/[locale]/(library)/layout.tsx`: wrap the content of `StageProvider` in `<OnlineProvider>` (import from `@/components/online/OnlineProvider`):

```tsx
    <StageProvider>
      <OnlineProvider>
        <ExploreStage>
          <LibraryStageClient />
          {children}
        </ExploreStage>
      </OnlineProvider>
    </StageProvider>
```

- [ ] **Step 6: Verify** — typecheck, lint, test. In Chrome on `/explore/wall/1?hex=babel` with `npm run online` running: the Network panel (`list_network_requests`) shows the `/api/online/guest` POST and a `101` WebSocket to `:3001`. Ask the user to stop `npm run online`: the page keeps walking; restart it: within 30 s the socket is back (a new 101).

---

### Task 8: Reporting the visitor and drawing the others

**Files:**
- Modify: `src/components/online/presence.ts` (pure pose maths), create `src/components/online/presence.test.ts`
- Modify: `src/components/explore/stage/stageStore.ts` (`StageCommands.visitorPose`), `src/components/explore/stage/Director.tsx` (register it)
- Create: `src/components/online/PresenceReporter.tsx`, `src/components/online/RemotePlayers.tsx`
- Modify: `src/components/explore/stage/StageScene.tsx`
- Create: `public/models/reader.glb`, `public/models/README.md`

**Interfaces:**
- Consumes: `WorldPlace` (`level`, `col`, `cell`) from the stage store; `galleryCenter`, `facingSide`, `sideWall`, `ROOM` (geometry); `cellKey`, `offsetCell`, `Cell` (world).
- Produces:
  - `presenceOf(place: { col: number; level: number; cell: Cell }, eye: THREE.Vector3Like, yaw: number, view: View): Pose`
  - `viewOf(view: StageView, yaw: number, spread: number): View`
  - `poseChanged(a: Pose, b: Pose): boolean`
  - `interface Placed { x: number; y: number; z: number; yaw: number; speed: number; view: View }`
  - `placeAvatar(track: Track | undefined, place: { col: number; level: number; cell: Cell }, now: number): Placed | null`
  - `DELAY = 120` (ms)
  - `StageCommands.visitorPose?(): WalkPose | null`

- [ ] **Step 1: Failing tests** — `src/components/online/presence.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ROW, galleryCenter } from "@/components/explore/geometry";
import type { View } from "@/lib/online/protocol";
import { DELAY, placeAvatar, poseChanged, presenceOf, viewOf, type Sample } from "./presence";

const walk: View = { kind: "walk", wall: 1 };
const here = { col: 3, level: -1, cell: { x: 103n, floor: 9n } }; // the world's anchor is (100, 10)
const sample = (t: number, x: bigint, floor: bigint, p: [number, number, number], yaw = 0): Sample => ({ t, cell: { x, floor }, p, yaw, view: walk });

describe("presenceOf", () => {
  it("sends the eye relative to the visitor's gallery, and the gallery itself", () => {
    const [cx, cy, cz] = galleryCenter(3, -1);
    const pose = presenceOf(here, new THREE.Vector3(cx + 1, cy + 1.6, cz - 2), 7, walk);
    expect(pose).toEqual({ cell: "103:9", p: [1, 1.6, -2], yaw: expect.closeTo(7 - 2 * Math.PI, 3), view: walk });
  });
});

describe("viewOf", () => {
  it("names the wall faced while walking, 0 for a doorway", () => {
    expect(viewOf({ kind: "walk", hex: "x", wall: 1 }, Math.atan2(-Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)), 0)).toEqual({ kind: "walk", wall: 1 });
  });
  it("names the page being read", () => {
    const book = { hex: "x", wall: 2, shelf: 3, volume: 4 };
    expect(viewOf({ kind: "desk", book, mode: "read" }, 0, 20)).toEqual({ kind: "desk", wall: 2, shelf: 3, volume: 4, page: 40 });
    expect(viewOf({ kind: "desk", book, mode: "index" }, 0, 20)).toEqual({ kind: "desk", wall: 2, shelf: 3, volume: 4, page: 0 });
  });
});

describe("poseChanged", () => {
  const a = { cell: "0:0", p: [0, 1.6, 0] as [number, number, number], yaw: 0, view: walk };
  it("ignores jitter and notices steps, turns, galleries and views", () => {
    expect(poseChanged(a, { ...a, p: [0.01, 1.6, 0] })).toBe(false);
    expect(poseChanged(a, { ...a, p: [0.05, 1.6, 0] })).toBe(true);
    expect(poseChanged(a, { ...a, yaw: 0.05 })).toBe(true);
    expect(poseChanged(a, { ...a, cell: "1:0" })).toBe(true);
    expect(poseChanged(a, { ...a, view: { kind: "walk", wall: 2 } })).toBe(true);
  });
});

describe("placeAvatar", () => {
  it("blends between the poses either side of now − DELAY", () => {
    const track = [sample(0, 103n, 9n, [0, 1.6, 0]), sample(100, 103n, 9n, [1, 1.6, 0])];
    const placed = placeAvatar(track, here, 50 + DELAY)!;
    const [cx, cy] = galleryCenter(3, -1);
    expect(placed.x).toBeCloseTo(cx + 0.5, 6);
    expect(placed.y).toBeCloseTo(cy + 1.6, 6);
    expect(placed.speed).toBeCloseTo(10, 6);
  });

  it("draws a visitor two galleries along, not three, and nobody on another floor", () => {
    expect(placeAvatar([sample(0, 105n, 9n, [0, 1.6, 0])], here, 1000)).not.toBeNull();
    expect(placeAvatar([sample(0, 106n, 9n, [0, 1.6, 0])], here, 1000)).toBeNull();
    expect(placeAvatar([sample(0, 103n, 11n, [0, 1.6, 0])], here, 1000)).toBeNull();
    expect(placeAvatar([sample(0, 10n ** 300n, 9n, [0, 1.6, 0])], here, 1000)).toBeNull();
  });

  it("snaps instead of sliding when a visitor jumps", () => {
    const track = [sample(0, 103n, 9n, [0, 1.6, 0]), sample(100, 104n, 9n, [0, 1.6, 0])];
    const placed = placeAvatar(track, here, 10 + DELAY)!;
    const [cx] = galleryCenter(4, -1);
    expect(placed.x).toBeCloseTo(cx, 6);
    expect(ROW.period).toBeGreaterThan(3);
  });

  it("turns the short way round", () => {
    const track = [sample(0, 103n, 9n, [0, 1.6, 0], 3), sample(100, 103n, 9n, [0, 1.6, 0], -3)];
    expect(Math.abs(placeAvatar(track, here, 50 + DELAY)!.yaw)).toBeGreaterThan(3);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Pose maths** — append to `src/components/online/presence.ts` (and add the imports `import * as THREE from "three"`, `galleryCenter, facingSide, sideWall` from `@/components/explore/geometry`, `type Pose` from the protocol, `cellKey` from `@/lib/world`, `type StageView` from `@/components/explore/stage/stageStore`):

```ts
/** How far behind the newest pose the others are drawn, so there is nearly always a pose on each side to blend (ms). */
export const DELAY = 120;
/** Others are drawn this many galleries along the row either way, on the visitor's floor only. */
const SEEN_COLS = 2n;
/** A move faster than this between two poses is a jump (a teleport, a new world): the avatar snaps (m/s). */
const JUMP_SPEED = 30;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const round = (n: number) => Math.round(n * 1000) / 1000;

/** The visitor's pose for the others: their gallery, their eye in it, where they look, what they do. */
export function presenceOf(place: { col: number; level: number; cell: Cell }, eye: THREE.Vector3Like, yaw: number, view: View): Pose {
  const [cx, cy, cz] = galleryCenter(place.col, place.level);
  return { cell: cellKey(place.cell), p: [round(eye.x - cx), round(eye.y - cy), round(eye.z - cz)], yaw: round(wrap(yaw)), view };
}

/** What a stage view looks like to the others. `spread` is the reader's spread (the page is its even page). */
export function viewOf(view: StageView, yaw: number, spread: number): View {
  if (view.kind === "walk") return { kind: "walk", wall: sideWall(facingSide(yaw)) };
  if (view.kind === "shelf") return { kind: "shelf", wall: view.wall, shelf: view.shelf };
  const { wall, shelf, volume } = view.book;
  return { kind: "desk", wall, shelf, volume, page: view.mode === "read" ? spread * 2 : 0 };
}

const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

/** Worth sending: a step of 2 cm, a turn of 0.01 rad, another gallery or another view. */
export function poseChanged(a: Pose, b: Pose): boolean {
  return (
    a.cell !== b.cell ||
    Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) > 0.02 ||
    Math.abs(wrap(a.yaw - b.yaw)) > 0.01 ||
    !sameView(a.view, b.view)
  );
}

export interface Placed {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  view: View;
}

/** A sample's eye in the visitor's world, or null when it is out of sight from the visitor's gallery. */
function eyeOf(s: Sample, place: { col: number; level: number; cell: Cell }): [number, number, number] | null {
  const dcol = s.cell.x - place.cell.x;
  if (s.cell.floor !== place.cell.floor || dcol < -SEEN_COLS || dcol > SEEN_COLS) return null;
  const [cx, cy, cz] = galleryCenter(place.col + Number(dcol), place.level);
  return [cx + s.p[0], cy + s.p[1], cz + s.p[2]];
}

/** Where to draw another visitor now, blended between their poses either side of now − DELAY; null when out of sight. */
export function placeAvatar(track: Track | undefined, place: { col: number; level: number; cell: Cell }, now: number): Placed | null {
  if (!track?.length) return null;
  const t = now - DELAY;
  let b = track.findIndex((s) => s.t > t);
  if (b === -1) b = track.length - 1;
  const a = Math.max(0, b - 1);
  const sa = track[a];
  const sb = track[b];
  const pb = eyeOf(sb, place);
  if (!pb) return null;
  const pa = eyeOf(sa, place);
  const dt = (sb.t - sa.t) / 1000;
  const dist = pa ? Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) : Infinity;
  if (!pa || dt <= 0 || dist / dt > JUMP_SPEED || t >= sb.t) {
    return { x: pb[0], y: pb[1], z: pb[2], yaw: sb.yaw, speed: 0, view: sb.view };
  }
  const f = THREE.MathUtils.clamp((t - sa.t) / (sb.t - sa.t), 0, 1);
  return {
    x: pa[0] + (pb[0] - pa[0]) * f,
    y: pa[1] + (pb[1] - pa[1]) * f,
    z: pa[2] + (pb[2] - pa[2]) * f,
    yaw: sa.yaw + wrap(sb.yaw - sa.yaw) * f,
    speed: dist / dt,
    view: f < 0.5 ? sa.view : sb.view,
  };
}
```

Note: the "snaps" test samples at `t = 10` (`now = 10 + DELAY`), between the two poses, and the jump of one gallery (~9.7 m in 0.1 s = 97 m/s) is over `JUMP_SPEED`, so it snaps to the newer pose. Run → PASS.

- [ ] **Step 3: The visitor's pose on the stage** — `stageStore.ts` `StageCommands` gets

```ts
  /** Where the visitor stands, for others to see (null before a world is up). */
  visitorPose?(): WalkPose | null;
```

(import `type WalkPose` from `./poses`). In `Director.tsx`, in the effect that registers `store.commands.lookAt` (around `:685`), register it too and delete it in the same cleanup:

```ts
    // For others to see: the eye while walking, the spot left for a close-up, or standing at the desk of the book read.
    store.commands.visitorPose = () => {
      const state = controller.current;
      const place = store.getSnapshot().place;
      if (!state || !place) return null;
      if (state.kind === "walk" && !flight.current) return controlsRef.current?.getPose() ?? visitorPose.current;
      if (state.kind === "desk") {
        const desk = staging.current?.books.find((b) => b.shown)?.desk ?? state.book.wall;
        return visitorAtDesk(place.level, place.col, desk);
      }
      return visitorPose.current;
    };
```

- [ ] **Step 4: `src/components/online/PresenceReporter.tsx`**

```tsx
"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Pose } from "@/lib/online/protocol";
import { useStageStore } from "@/components/explore/stage/StageProvider";
import { useOnlineStore } from "./OnlineProvider";
import { poseChanged, presenceOf, viewOf } from "./presence";

/** Tells the online Library where the visitor is, at most ten times a second and only when it changed. */
export default function PresenceReporter() {
  const stage = useStageStore();
  const online = useOnlineStore();
  const sent = useRef<Pose | null>(null);
  const at = useRef(0);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (now - at.current < 0.1) return;
    at.current = now;
    if (online.getSnapshot().status !== "online") {
      sent.current = null;
      return;
    }
    const { place, view, desk } = stage.getSnapshot();
    const pose = stage.commands.visitorPose?.();
    if (!place || !view || !pose) return;
    const next = presenceOf(place, pose.position, pose.yaw, viewOf(view, pose.yaw, desk?.spread ?? 0));
    if (sent.current && !poseChanged(sent.current, next)) return;
    sent.current = next;
    online.send({ type: "pose", ...next });
  });
  return null;
}
```

- [ ] **Step 5: Choose the model — ask the user first.** Look for a CC0 rigged humanoid in glTF/GLB with idle and walk clips, ≤ 3 MB, that fits a library (a robed or plainly dressed figure). Candidates to check, in this order: Quaternius "Ultimate Animated Character Pack" (CC0; check the GLB/glTF download and its clip names), Quaternius "Universal Base Characters" + "Universal Animation Library" (CC0), Kenney "Animated Characters" (CC0; FBX — would need conversion, so last). Use the built-in browser to read the pages; **do not download anything yet**. Tell the user the exact file name, source URL, size and licence, and wait for a yes. Then download it into `public/models/reader.glb` and write `public/models/README.md`:

```md
# Models

- `reader.glb` — <model name> by <author>, <source URL>, licence CC0 1.0. Clips used: <idle>, <walk>, <read or idle>.
```

Inspect it in Node (`npx` is not needed: read the GLB JSON chunk with a scratchpad script: bytes 20.. of the file, length from bytes 12..16) and note: the clip names, the material names of the clothes (to tint), the height in metres (for `MODEL_SCALE`), which way it faces (for `MODEL_YAW`), and whether a bone named like `Head` exists.

- [ ] **Step 6: `src/components/online/RemotePlayers.tsx`** — fill the four constants from Step 5:

```tsx
"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ROOM } from "@/components/explore/geometry";
import { useStageSelector, useStageStore } from "@/components/explore/stage/StageProvider";
import type { Player } from "@/lib/online/protocol";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import { placeAvatar } from "./presence";

const MODEL = "/models/reader.glb";
/** Clip names in reader.glb (see public/models/README.md); "read" falls back to idle with the head bowed. */
const CLIPS = { idle: "Idle", walk: "Walk", read: "Idle" } as const;
/** Materials of reader.glb tinted with the player's colour. */
const TINTED = /cloth|shirt|robe|coat/i;
/** reader.glb is MODEL_HEIGHT metres tall and faces +z; scaled to a visitor's height and turned to look along yaw. */
const MODEL_SCALE = 1;
const MODEL_YAW = Math.PI;
/** Labels are hidden beyond this distance (m): they would show through walls. */
const LABEL_RANGE = 14;

type Clip = keyof typeof CLIPS;

function Avatar({ player }: { player: Player }) {
  const online = useOnlineStore();
  const stage = useStageStore();
  const gltf = useGLTF(MODEL);
  const model = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => {
    const out = {} as Record<Clip, THREE.AnimationAction>;
    for (const [key, name] of Object.entries(CLIPS) as [Clip, string][]) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name) ?? gltf.animations[0];
      out[key] = mixer.clipAction(clip);
    }
    return out;
  }, [mixer, gltf.animations]);
  const head = useMemo(() => model.getObjectByName("Head") ?? null, [model]);
  const group = useRef<THREE.Group>(null);
  const label = useRef<HTMLDivElement>(null);
  const playing = useRef<Clip | null>(null);

  // Each avatar has its own copies of the tinted materials, in its player's colour.
  useEffect(() => {
    const made: THREE.Material[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (!TINTED.test(material.name)) return;
      const tinted = material.clone();
      tinted.color.set(player.color);
      mesh.material = tinted;
      made.push(tinted);
    });
    return () => made.forEach((m) => m.dispose());
  }, [model, player.color]);

  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  useFrame(({ camera }, dt) => {
    const g = group.current;
    if (!g) return;
    const place = stage.getSnapshot().place;
    const placed = place ? placeAvatar(online.tracks.get(player.id), place, performance.now()) : null;
    g.visible = placed !== null;
    if (!placed) return;
    g.position.set(placed.x, placed.y - ROOM.eyeHeight, placed.z);
    g.rotation.y = placed.yaw + MODEL_YAW;
    const clip: Clip = placed.view.kind === "desk" ? "read" : placed.speed > 0.3 ? "walk" : "idle";
    if (clip !== playing.current) {
      if (playing.current) actions[playing.current].fadeOut(0.25);
      actions[clip].reset().fadeIn(0.25).play();
      playing.current = clip;
    }
    mixer.update(Math.min(dt, 0.1));
    if (head && clip === "read") head.rotation.x += 0.45; // bowed over the book; the mixer resets it every frame
    if (label.current) label.current.style.display = camera.position.distanceTo(g.position) < LABEL_RANGE ? "block" : "none";
  });

  return (
    <group ref={group} visible={false}>
      <primitive object={model} scale={MODEL_SCALE} />
      <Html position={[0, ROOM.eyeHeight + 0.45, 0]} center style={{ pointerEvents: "none" }}>
        <div
          ref={label}
          style={{
            font: "500 12px var(--font-jetbrains), monospace",
            color: player.color,
            whiteSpace: "nowrap",
            textShadow: "0 0 4px #000, 0 0 8px #000",
          }}
        >
          {player.nick}
        </div>
      </Html>
    </group>
  );
}

/** The other visitors of this Library near the visitor, as readers in their colours. */
export default function RemotePlayers() {
  const players = useOnlineSelector((s) => s.players);
  const ready = useStageSelector((s) => s.place !== null);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      {[...players.values()].map((p) => (
        <Avatar key={p.id} player={p} />
      ))}
    </Suspense>
  );
}

useGLTF.preload(MODEL);
```

Every avatar of the scene shares one shader program per material kind; the first avatar to appear compiles it once (a one-off hitch). ponytail: if that hitch shows, render one hidden avatar from the start.

- [ ] **Step 7: Mount them** — `StageScene.tsx`: render `<PresenceReporter />` and `<RemotePlayers />` after `<Director …/>`.

- [ ] **Step 8: Verify** — typecheck, lint, test. Two Chrome pages (two `new_page`s; the second in an incognito-like context is not needed — a second tab of the same guest shares the id, so for two players use the smoke script from Task 6 with a pose stream instead: extend it to send `pose` every 100 ms walking along `p[0]` from −2 to 2 in the cell of the page's gallery, read from `window.__stage.store.getSnapshot().place.cell` via `evaluate_script` and passed as an argument). Screenshot: an avatar in the player's colour walking across the gallery with its nick above. Then send a pose two floors up: the avatar disappears.

---

### Task 9: Who is online; my nick and colour; back where I was

**Files:**
- Create: `src/components/online/OnlineHud.tsx`
- Modify: `src/app/[locale]/(library)/layout.tsx` (render `<OnlineHud />` inside `ExploreStage`, after `{children}`)
- Modify: `src/app/[locale]/(library)/explore/wall/[wall]/page.tsx` (spawn at the last place)
- Modify: `messages/ru.json`, `messages/en.json` (new `Online` namespace)

**Interfaces:**
- Consumes: `useOnlineSelector`, `useOnlineStore` (Task 7); `FragmentColorPicker({ color, onChange })` (`src/components/explore/FragmentColorPicker.tsx`); `formatCoordinate`, `parseCellKey`, `addressOf`, `spawnHex` (plan 1).
- Produces: `OnlineHud` (top-right, under the HUD's top bar, `zIndex` 6, `pointerEvents: "auto"` on its own controls only); plan 3 adds "go to" buttons to its rows.

- [ ] **Step 1: Messages** — add to `messages/ru.json`:

```json
  "Online": {
    "online": "{count, plural, one {# читатель} few {# читателя} many {# читателей} other {# читателя}} в Библиотеке",
    "alone": "Вы одни в Библиотеке",
    "connecting": "Соединение…",
    "offline": "Одиночная Библиотека",
    "you": "Вы",
    "nick": "Имя",
    "save": "Сохранить",
    "walking": "бродит · галерея {x} · этаж {floor}",
    "atShelf": "у полки {shelf} стены {wall} · галерея {x} · этаж {floor}",
    "reading": "читает: стена {wall}, полка {shelf}, том {volume}, стр. {page} · галерея {x} · этаж {floor}"
  }
```

and to `messages/en.json`:

```json
  "Online": {
    "online": "{count, plural, one {# reader} other {# readers}} in the Library",
    "alone": "You are alone in the Library",
    "connecting": "Connecting…",
    "offline": "A Library of your own",
    "you": "You",
    "nick": "Name",
    "save": "Save",
    "walking": "wandering · gallery {x} · floor {floor}",
    "atShelf": "at shelf {shelf} of wall {wall} · gallery {x} · floor {floor}",
    "reading": "reading: wall {wall}, shelf {shelf}, volume {volume}, p. {page} · gallery {x} · floor {floor}"
  }
```

- [ ] **Step 2: `src/components/online/OnlineHud.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Box, Flex, Input, Text, chakra } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import FragmentColorPicker from "@/components/explore/FragmentColorPicker";
import { cleanNick, type Player } from "@/lib/online/protocol";
import { formatCoordinate, parseCellKey } from "@/lib/world";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";

const mono = "var(--font-jetbrains), monospace";

/** "wandering · gallery 3 · floor −2", or what they read. */
function useDoing() {
  const t = useTranslations("Online");
  return (p: Player) => {
    const cell = parseCellKey(p.cell);
    const at = { x: cell ? formatCoordinate(cell.x) : "?", floor: cell ? formatCoordinate(cell.floor) : "?" };
    if (p.view.kind === "walk") return t("walking", at);
    if (p.view.kind === "shelf") return t("atShelf", { ...at, wall: p.view.wall, shelf: p.view.shelf });
    return t("reading", { ...at, wall: p.view.wall, shelf: p.view.shelf, volume: p.view.volume, page: p.view.page });
  };
}

/** Who else is in this Library and what they do; my own name and colour. Plan 3 adds the way to each of them. */
export default function OnlineHud() {
  const t = useTranslations("Online");
  const online = useOnlineStore();
  const status = useOnlineSelector((s) => s.status);
  const you = useOnlineSelector((s) => s.you);
  const players = useOnlineSelector((s) => s.players);
  const doing = useDoing();
  const [open, setOpen] = useState(false);
  const [nick, setNick] = useState<string | null>(null);

  const label = status === "offline" ? t("offline") : status === "connecting" || !you ? t("connecting") : players.size ? t("online", { count: players.size + 1 }) : t("alone");
  const saveNick = () => {
    const clean = cleanNick(nick);
    if (clean && clean !== you?.nick) online.send({ type: "profile", nick: clean });
    setNick(null);
  };

  return (
    <Box position="absolute" top={{ base: 14, md: 16 }} right={{ base: 3, md: 6 }} zIndex={6} maxW="340px" fontFamily={mono} fontSize="11px">
      <chakra.button
        onClick={() => setOpen((o) => !o)}
        display="flex"
        alignItems="center"
        gap={2}
        ml="auto"
        px={3}
        py={1.5}
        borderRadius="full"
        bg="rgba(8,8,15,0.72)"
        border="1px solid"
        borderColor="brand.300/30"
        color="dark.100"
        cursor="pointer"
      >
        <Box w="7px" h="7px" borderRadius="full" bg={status === "online" ? "#4f9a5a" : status === "connecting" ? "#c9a227" : "dark.400"} />
        {label}
      </chakra.button>

      {open && status === "online" && you && (
        <Box mt={2} p={3} borderRadius="8px" bg="rgba(8,8,15,0.86)" border="1px solid" borderColor="brand.300/20">
          <Flex align="center" gap={2} mb={players.size ? 3 : 0}>
            <FragmentColorPicker color={you.color} onChange={(color) => online.send({ type: "profile", color })} />
            <Input
              size="xs"
              value={nick ?? you.nick}
              aria-label={t("nick")}
              onChange={(e) => setNick(e.target.value)}
              onBlur={saveNick}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              maxLength={24}
            />
            <Text color="dark.300">{t("you")}</Text>
          </Flex>
          {[...players.values()].map((p) => (
            <Flex key={p.id} gap={2} py={1} align="baseline">
              <Box flex="none" w="8px" h="8px" borderRadius="full" bg={p.color} />
              <Box>
                <Text color="dark.100">{p.nick}</Text>
                <Text color="dark.300">{doing(p)}</Text>
              </Box>
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

(If the colour-picker popover opens under other HUD parts, keep its `positioning` as is — it already opens upwards — and give the panel `overflow="visible"`.)

- [ ] **Step 3: Layout** — render `<OnlineHud />` after `{children}` inside `ExploreStage` in `src/app/[locale]/(library)/layout.tsx`.

- [ ] **Step 4: Back where I was** — on the walk page replace the spawn effect with:

```ts
  const online = useOnlineStore();
  // A gallery without an address: where this guest was last in this Library, if the server says so within a moment,
  // or else somewhere near the centre. Client-side only, so server and client markup agree.
  useEffect(() => {
    if (hex) return;
    let done = false;
    const go = (target: string, wall: number) => {
      if (done) return;
      done = true;
      router.replace(`/explore/wall/${wall}?hex=${target}`, { scroll: false });
    };
    const decide = () => {
      const { you, last, status } = online.getSnapshot();
      const cell = last && parseCellKey(last.cell);
      if (you) go(cell ? addressOf(cell) : spawnHex(), cell ? last.wall : initialWall);
      else if (status === "offline") go(spawnHex(), initialWall);
    };
    decide();
    const unsubscribe = online.subscribe(decide);
    const timer = setTimeout(() => go(spawnHex(), initialWall), 1200);
    return () => {
      done = true;
      unsubscribe();
      clearTimeout(timer);
    };
  }, [hex, initialWall, router, online]);
```

(imports: `useOnlineStore` from `@/components/online/OnlineProvider`, `addressOf`, `parseCellKey`, `spawnHex` from `@/lib/world`). Note the first `status` is `"connecting"`, so `decide` waits for either the welcome or the 1.2 s timer.

- [ ] **Step 5: Verify** — typecheck, lint, test. Chrome: the pill shows "Вы одни в Библиотеке"; open it, change the nick, press Enter; run the smoke script (it is another guest): the pill shows 2 readers and the list says what the smoke guest does. Walk somewhere, reload `/explore/wall/1` without `hex`: you come back to that gallery.

---

### Task 10: Docs

**Files:**
- Modify: `README.md`, `README.en.md`

- [ ] **Step 1:** Add an "Online" section to both READMEs (in each one's language): what it does (one Library for everyone, see others, what they read, nick and colour), how to run it locally (`cp .env.example .env.local` and fill the secrets; Docker Desktop; `npm run db`; `npm run online`; `npm run dev`), that without the server the Library is solo, and the model's credit (from `public/models/README.md`).

- [ ] **Step 2:** typecheck, lint, test; ask the user whether to commit (suggest: server + protocol; client store + presence + avatars; HUD + docs).
