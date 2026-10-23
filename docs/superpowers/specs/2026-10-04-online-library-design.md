# The online Library — design

Status: agreed with the user on 2026-10-04 (grilling session). Implementation is split into four plans:

1. `docs/superpowers/plans/2026-10-04-online-1-world.md` — one global world, Borges' galleries, the new alphabet
2. `docs/superpowers/plans/2026-10-04-online-2-presence.md` — server, guests, presence, avatars
3. `docs/superpowers/plans/2026-10-04-online-3-map.md` — map, fog of war, teleport
4. `docs/superpowers/plans/2026-10-04-online-4-notes-chat.md` — notes, chat, moderation

The user asked for all four to be built in one go (no demo between them), in that order: each plan builds on the
previous one's interfaces.

## 1. What we are building

The Library becomes a shared sandbox, like a Minecraft world crossed with Pixel Battle: everyone walks the **same**
Library, sees who else is in it and where, opens the same fog of war together, and leaves notes on what they found.

Decisions (the user's, verbatim in substance):

| Topic | Decision |
|---|---|
| Geography | One global world. Every gallery has a fixed place and fixed neighbours; address ↔ coordinates is a bijection. Centre at (0, 0). |
| Horizontal links | Borges' canon: 4 walls of shelves, 2 doors on opposite sides; the galleries of a floor stand in a row, door to door, a vestibule (closets, mirror, spiral stair) between each pair. The world is 2-D (column × floor); the map is a vertical cross-section. |
| Alphabet | For the whole site, "readable minimum": lowercase letters, space, `. , ! ? - :`. RU 40 symbols (Cyrillic only), EN 33. No line breaks, digits, capitals or ASCII marks. Old links may break; the user does not care. |
| Languages | RU and EN are two separate worlds: own players, fog, notes, chat. |
| Identity | Guests: random editable nick and clothes colour, identified by an httpOnly cookie. No OAuth. |
| Realtime | Own WebSocket server (`ws`) next to Next.js; positions in memory at ~10 Hz; Postgres for everything that persists. |
| Visibility | Everyone sees everyone, including which book and page they are reading. |
| Mechanics | Notes on findings (a gallery or a fragment of a page) and a shared fog of war. No painting, no placed objects. |
| Map | Minimap in a corner + full map on **M**; 2-D canvas; data loaded by chunks. |
| Teleport | Anywhere by clicking the map, to a player, to a note, or by address. |
| Chat | One channel per world; a "share place" chip that teleports; the last 200 messages are kept. |
| Moderation | Rate and length limits; authors delete their own; an admin token (from `.env`) shows delete/ban buttons. |
| Avatars | A rigged CC0 humanoid with idle / walk / read animations, clothes tinted with the player's colour, nick above the head. The player stays first-person. |
| Spawn | Returning players come back to their last gallery; newcomers to a random gallery near the centre; a "to the centre" button is always there. |
| Infra | Local `docker compose` with Postgres first; a VPS deploy is a later, separate step. |
| Offline | If the server or the database is down, the site works as today, solo. |

## 2. The world

### 2.1 A gallery

A hexagon (`ROOM` in `src/components/explore/geometry.ts`), sides numbered 0..5 by `sideAngle(i) = i·60° + 30°`.

- **Walls of shelves** stand on sides 0, 1, 3, 4: wall *n* (1..4) is on side `WALL_SIDES[n − 1]`.
- **Doorways** are sides 5 (east) and 2 (west).
- `LIBRARY.walls` becomes 4. Everything that maps a wall to a side (`sideAngle(wall − 1)` today) goes through
  `wallSide(wall)`; a side back to a wall through `sideWall(side)` (0 for a doorway).
- Four reading desks, one across the shaft from each wall.

### 2.2 Rows and floors

The galleries of a floor stand in a row along the axis through the doorways. Gallery column `col` (relative to the
world's anchor, see 2.4) is centred at `col · ROW.period` along that axis, `ROW.period = 2·apothem + vestibuleDepth`
(the distance between the two galleries of today's pair). The vestibule *east* of gallery `col` joins it to `col + 1`
and holds the spiral stair, the closets and the mirror; every vestibule has a stair, so every floor is reachable
everywhere. All galleries face the same way (no more "gallery B turned half a circle").

### 2.3 Addresses and cells

A **cell** is `{ x: bigint, floor: bigint }`. `src/lib/world.ts` maps every valid address (1..MAX_ADDRESS_LENGTH digits
of `DIGS`) to exactly one cell and back:

1. **Gallery number.** Addresses are ordered by length, then as base-62 numbers:
   `index(hex) = (62^len − 62)/61 + value(hex)`. `GALLERIES = (62^(L+1) − 62)/61` with `L = MAX_ADDRESS_LENGTH` (4819
   with the new alphabets).
2. **Mixing.** Addresses that share leading digits share the start of every page (a page is the address minus a
   keystream that depends only on wall/shelf/volume/page). Neighbouring galleries must therefore not have neighbouring
   numbers: `n = UNMIX · (index − SHIFT) mod GALLERIES`, `MIX ≈ GALLERIES/φ` made coprime with `GALLERIES`
   (golden-ratio spreading), `SHIFT = GALLERIES/3`.
3. **Pairing.** `n ↔ (a, b)` by Szudzik's pairing (the square of side *s* holds exactly the numbers below *s²*), and
   `a, b ↔ x, floor` by the zigzag map (0, −1, 1, −2, … ↔ 0, 1, 2, 3, …). Small coordinates get small *n*.
4. **The edge.** The square holds every address up to about 10^4318 galleries from the centre. Beyond it,
   `addressOf` wraps modulo `GALLERIES`: "the Library is unlimited and cyclical". Nobody will walk there.

Cost (measured, Node 24): one conversion ≈ 2.5 ms; finding `MIX`'s inverse ≈ 1 ms at module load. BigInt literals need
`tsconfig` `target` ≥ ES2020.

Cells travel as **keys** `"x:floor"` (decimal) in URLs, messages and the database. People read coordinates through
`formatCoordinate` (plain up to six digits, then `3.14·10^7`).

### 2.4 Streaming

A world is still built around one address (`worldHex`, the anchor, cell `cellOf(worldHex)`); the scene keeps small
integer offsets `(col, level)` from it, `col` along the row, `level` up. The visitor's place is
`WorldPlace { level, col, hex, cell }`.

- Near cells: columns `col−1..col+1` × levels `level−1..level+1` (9 galleries, full detail, own materials).
- Vestibules: columns `col−1` and `col` on the three near levels, plus `col−2` and `col+1` on the visitor's level.
- Far cells (cheap `DistantLevel`, the current gallery's materials): columns `col−1..col+1` on the far levels, and
  `col±2` on the near levels.
- Stairs in the vestibules `col−1` and `col`; one mirror, in the vestibule nearer the visitor.
- The light pool keeps exactly 11 lights: the lamps of galleries `col−1..col+1` (6), the fill of the current gallery
  (1), the vestibule lamps of `col−1` and `col` (2), the shelf spot and the desk lamp.
- Addresses of the world's cells are computed once each (a per-world cache).
- Float precision: positions grow with distance walked from the anchor (10 km after ~1000 galleries); three.js builds
  matrices in doubles, so this is fine. A teleport or reload re-anchors.

### 2.5 Spawn

- A URL without `?hex=` goes to `addressOf(cellNearCentre())` (x ∈ [−50, 50], floor ∈ [−20, 20]) — or, once online
  (plan 2), to the player's last gallery in that world if the server knows one (waits at most 1.2 s for it).
- "To the centre" (HUD button): `addressOf({ x: 0n, floor: 0n })`.

### 2.6 The alphabet

`src/lib/alphabet.ts`: `ALPHABETS.ru = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя .,!?-:"` (40),
`ALPHABETS.en = "abcdefghijklmnopqrstuvwxyz .,!?-:"` (33). `normalizeText` lowercases letters the alphabet only has in
lowercase, turns every whitespace (line breaks and tabs included) into a space, folds dashes into `-` and `…` into
`...`, and drops everything else. Both alphabets now pack one digit per symbol, so `MAX_ADDRESS_LENGTH = 4819`.

## 3. Online architecture

```
browser ──HTTP──▶ Next.js (pages, /api/*, /api/online/guest sets the guest cookie)
   │
   └──WebSocket──▶ online server (src/server, tsx, port 3001) ──▶ Postgres (docker compose)
```

- **Next.js** stays stateless: the only online route signs a guest cookie (`babel_guest`, httpOnly, SameSite=Lax,
  one year) — `<uuid>.<HMAC-SHA256(uuid, GUEST_SECRET) base64url>`. Next.js never talks to Postgres.
- **The online server** verifies the cookie on the WebSocket upgrade (cookies are sent to every port of a host),
  upserts the guest row, and keeps one `World` per language in memory: connected players and their poses. It writes
  to Postgres: guests, last positions, fog, notes, chat, bans.
- **Client**: an `OnlineProvider` in the `(library)` layout owns the connection and a framework-free `onlineStore`
  (same pattern as `stageStore`). URL: `NEXT_PUBLIC_WS_URL` or `ws://<page host>:3001`. Reconnects with backoff
  (1, 2, 4 … 30 s). Status `connecting | online | offline`; offline means solo, nothing else changes.
- One connection per tab; a guest with two tabs is two players with the same id (the newest pose wins; ponytail:
  fine for a sandbox).

## 4. Protocol

JSON text frames. Every client message is validated by `parseClientMessage` (`src/lib/online/protocol.ts`), shared by
both sides; anything invalid is dropped. Cells are keys (`"x:floor"`), never raw numbers.

Client → server:

| type | fields | plan |
|---|---|---|
| `hello` | `lang`, `admin?` (token) | 2 |
| `pose` | `cell`, `p: [x, y, z]` (metres, gallery-local), `yaw`, `view` | 2 |
| `profile` | `nick?`, `color?` | 2 |
| `watch` | `chunks: string[]` (≤ 64 chunk keys) | 3 |
| `chat` | `text`, `place?` | 4 |
| `note` | `cell`, `anchor?`, `text` | 4 |
| `forget` | `kind: "note" \| "chat"`, `id` (author or admin) | 4 |
| `ban` | `guest` (admin) | 4 |

`view` = `{ kind: "walk" }`, `{ kind: "shelf", wall, shelf }` or `{ kind: "desk", wall, shelf, volume, page }`
(page 0 = the index).

Server → client:

| type | fields | plan |
|---|---|---|
| `welcome` | `you: { id, nick, color }`, `last: { cell, wall } \| null`, `admin` | 2 |
| `players` | `list: Player[]` (full state, sent on join and every 2 s) | 2 |
| `poses` | `list: { id, cell, p, yaw, view }[]` (at 10 Hz, players that moved) | 2 |
| `left` | `id` | 2 |
| `chunk` | `key`, `fog` (base64, 128 bytes), `notes` | 3 (notes: 4) |
| `fog` | `key`, `bit` | 3 |
| `history` | `messages` | 4 |
| `message` | `message` | 4 |
| `noted` | `note` | 4 |
| `forgotten` | `kind`, `id` | 4 |
| `refused` | `reason: "rate" \| "length" \| "banned" \| "invalid"` | 4 |

`Player = { id, nick, color, cell, p, yaw, view }`.

## 5. Data (Postgres 17)

```sql
create table guests (
  id uuid primary key,
  nick text not null,
  color text not null,
  created_at timestamptz not null default now()
);
create table positions (           -- the last gallery of a guest in each world
  guest uuid not null references guests(id),
  lang text not null,
  cell text not null,               -- "x:floor"
  wall int not null,
  updated_at timestamptz not null default now(),
  primary key (guest, lang)
);
create table fog (                  -- 32×32 cells per row, one bit per gallery
  lang text not null,
  chunk text not null,              -- "cx:cfloor"
  bits bit(1024) not null,          -- bit i = gallery (i mod 32, i div 32) of the chunk; Postgres can OR bit strings
  primary key (lang, chunk)
);
create table notes (
  id bigserial primary key,
  lang text not null,
  chunk text not null,
  cell text not null,
  anchor jsonb,                     -- null: the gallery; else { wall, shelf, volume, page, start, end }
  text text not null,
  author uuid not null references guests(id),
  created_at timestamptz not null default now(),
  forgotten boolean not null default false
);
create index notes_chunk on notes (lang, chunk) where not forgotten;
create table messages (
  id bigserial primary key,
  lang text not null,
  author uuid not null references guests(id),
  text text not null,
  place jsonb,                      -- { cell, view, fragment? } (see section 9)
  created_at timestamptz not null default now(),
  forgotten boolean not null default false
);
create index messages_lang on messages (lang, id desc) where not forgotten;
create table bans (
  guest uuid,
  ip text,
  created_at timestamptz not null default now()
);
```

Plan 2 creates `guests` and `positions`, plan 3 `fog`, plan 4 the rest — each plan appends to `SCHEMA` in
`src/server/schema.ts`, which the server runs on start (`create table if not exists`).

## 6. Presence and avatars (plan 2)

- The stage reports the **visitor's pose**: walking — the controls' eye; at a shelf — where they stood before the
  close-up; at a desk — standing at that desk (`visitorAtDesk`). A new stage command `visitorPose()` returns it.
- `PresenceReporter` (inside the canvas) sends `pose` at most every 100 ms and only when something changed
  (> 2 cm, > 0.01 rad, another cell or view). Position is gallery-local: eye minus the centre of the visitor's gallery.
- `RemotePlayers` (inside the canvas) shows other players whose cell is within 2 columns and 1 floor of the visitor:
  world position = `galleryCenter(Δcol, Δlevel)` (Δ from the world's anchor, BigInt subtraction then `Number`) +
  local. Poses are interpolated 100 ms behind; animation: `read` at a desk, `walk` above 0.3 m/s, else `idle`.
- The model: one skinned glTF ≤ 3 MB under `public/models/`, CC0, with idle and walk clips (and a reading-like clip if
  the pack has one; otherwise idle with the head bowed). Chosen in plan 2, task 7 — **ask the user before downloading**
  (name, source, size). Clothes material tinted with the player's colour; nick in a drei `<Html>` label.
- The HUD lists who is online and what they read.

## 7. Map, fog, teleport (plan 3)

- **Chunks**: 32 columns × 32 floors; key `"cx:cfloor"` with floor division; bit `(x mod 32) + 32·(floor mod 32)`.
- **Fog**: the server marks a bit when a player's pose arrives in a cell it has not marked yet this session; writes are
  batched every 2 s (`insert … on conflict do update set bits = fog.bits | excluded.bits`); every client of the world
  gets `fog { key, bit }`. A `watch` is answered with one `chunk` per key.
- **Map** (`LibraryMap`, 2-D canvas): a vertical cross-section, column right, floor up. Explored galleries lit, fog
  dark, the centre marked, my gallery, other players as dots in their colour (nick on hover), notes as pins (plan 4).
  Pan by dragging, zoom by wheel (4..48 px per gallery). The view centre is a BigInt cell plus a fractional offset.
- **Minimap** (top-right, 180×180, centred on me, no panning); **full map** on M (Esc closes), over the scene.
- **Teleport**: click a gallery → "Go here"; click a player → "Go to <nick>" (and what they read). It navigates to
  `/explore/wall/<wall>?hex=<address>`; the director rebuilds the world behind the veil.

## 8. Notes (plan 4)

- A note: up to 300 characters, on a gallery (`anchor = null`) or on a fragment of a page
  (`{ wall, shelf, volume, page, start, end }`, the reader's existing selection). Permanent until forgotten.
- Created from the reader (select text → "Leave a note") or from the walk HUD ("Note here").
- Shown: pins on the map (`chunk.notes`); in the gallery HUD a list of its notes; in 3D a red ribbon hanging from
  the top of every volume that has a note, and a sheet of paper pinned beside the east doorway for gallery notes.
- Click a note (map, list, chat) → teleport there; a page note opens the reader at that page with the fragment marked.

## 9. Chat (plan 4)

- A panel bottom-left: the last messages fade after 10 s; **T** opens the input (Enter sends, Esc closes); `/admin
  <token>` is a command, not a message.
- "Share place" attaches the current place as `{ cell, view, fragment? }` — the gallery's key (a tenth of the length of
  its address, validated like any cell), what the sharer is doing there, and the fragment marked on the page they
  read; shown as a chip; click → go there.
- The last 200 messages of the world are sent on join (`history`).

## 10. Moderation and limits (plan 4)

- Lengths: nick 2..24, chat 300, note 300 (after trimming); colours `#rrggbb` only.
- Rates (token buckets per guest and per IP): chat 1 per 2 s (burst 5), notes 10 per hour (burst 3), profile 1 per 5 s,
  pose 12 per s (excess dropped silently), watch 4 per s.
- Authors forget their own notes and messages. An admin (a connection whose `hello` carried `ADMIN_TOKEN`, remembered
  in that browser's localStorage after `/admin <token>`) can forget anything and ban a guest (and the IP it is
  connected from). Bans are checked on upgrade and on every write.

## 11. Infra

- `docker-compose.yml`: `db` (postgres:17-alpine, volume `pgdata`, port 5432).
- `.env.local` (git-ignored; `.env.example` committed): `DATABASE_URL`, `GUEST_SECRET`, `ADMIN_TOKEN`, `WS_PORT=3001`,
  `NEXT_PUBLIC_WS_URL` (optional).
- `npm run online` = `tsx watch --env-file=.env.local src/server/index.ts`; `npm run db` = `docker compose up -d db`.
- New dependencies: `ws`, `postgres` (porsager); dev: `tsx`, `@types/ws`. Nothing else.
- VPS deploy (Dockerfile, Caddy, HTTPS, backups): later, not in these plans.

## 12. Ceilings (deliberate simplifications)

- Poses are broadcast to every client of a world (O(players²)); fine below ~100 players; chunk-based interest after.
- One process holds the worlds in memory; a second server instance would need Redis pub/sub.
- Two tabs of one guest are two players with one id.
- The world never re-anchors while walking; a reload does.
- 30 cheap far levels are separate meshes; merge them if frame time suffers.
