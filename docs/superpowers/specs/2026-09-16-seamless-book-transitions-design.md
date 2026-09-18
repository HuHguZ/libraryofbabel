# Seamless book transitions — design

Date: 2026-09-16. Status: approved by the user ("proceed to implementation, don't ask").

## 1. What the user gets

The four immersive routes of the Library become one continuous 3D experience on a single WebGL canvas:

| Route | Name here | What is shown |
|---|---|---|
| `/explore/wall/[wall]?hex=` | walk | first-person walking in the endless world |
| `/explore/wall/[wall]/shelf/[shelf]?hex=` | shelf | close-up of one shelf with titled spines, camera hanging over the shaft |
| `/explore/wall/[wall]/shelf/[shelf]/volume/[volume]?hex=` | desk / index | the volume lies open on a reading desk; left page = title page, right page = index of 410 pages |
| `/page/[address]?q=&text=` | desk / read | the same book on the same desk, open at a spread (the current reader) |

Transitions (all in both directions, triggered by clicks, HUD links, browser back/forward):

- **walk → index ("take")**: click a volume on a shelf. It slides out of its row, flies in an arc past the visitor to the reading desk on the shaft railing across from its wall, lands, and opens at the title/index spread. Meanwhile the camera turns and descends over the desk and ends at the reader's home view. **index → walk ("return")**: the book closes, flies back and slides into its gap; the camera returns to exactly where the visitor stood (position, level, yaw, pitch).
- **walk ↔ shelf**: the camera glides to/from the shelf close-up.
- **shelf → index / index → shelf**: the same take/return flights, starting/ending at the close-up.
- **index ↔ read**: choosing a page number turns a bunch of pages to that spread; going back to the index turns them back.
- **read (volume A) → read (neighbour volume B)** (turning past a cover): A closes and flies home, B flies out and opens.
- Any transition can be **skipped** (click on the scene, Space, Enter or Esc while it plays) and **reversed** (going back mid-flight plays it backwards from where it is). `prefers-reduced-motion`: all durations × 0.35.

Direct links to any of the four URLs work. The world is built around the address; a book link shows the book already open on its desk (its shelf gap empty), and "back" returns it to the shelf, leaving the visitor standing at that desk. The "The lamps are warming up…" veil is shown only when entering the Library from another page, or when the gallery address changes to one that is not where the visitor is (typed/pasted link).

HUD back links: index → the place the book was taken from (walk: "← wall N", shelf: "← shelf N"; direct link: walk); read → index (as now); shelf → walk. Browser back does the same through history.

While reading, the gallery around the desk is alive (shaft, floors above and below, lamps, walls across). Page turns, search highlights, match navigation, fragments, the text panel and the loupe work as today.

Non-goals: seamless transitions to/from non-Library pages (home, browse); URL format changes; recording new README clips (text only).

## 2. Architecture

### 2.1 Routes and layout

Move the four routes into a route group; URLs do not change:

```
src/app/[locale]/(library)/layout.tsx                                   NEW
src/app/[locale]/(library)/explore/wall/[wall]/page.tsx                 moved (git mv)
src/app/[locale]/(library)/explore/wall/[wall]/loading.tsx              moved, returns null
src/app/[locale]/(library)/explore/wall/[wall]/shelf/[shelf]/…          moved (page + loading → null)
src/app/[locale]/(library)/explore/wall/[wall]/shelf/[shelf]/volume/[volume]/…  moved (page + loading → null)
src/app/[locale]/(library)/page/[address]/…                             moved (page + loading → null)
```

`(library)/layout.tsx` renders `<StageProvider><ExploreStage><LibraryStage />{children}</ExploreStage></StageProvider>`. Layouts persist across navigations between their child routes (Next docs: "layouts preserve state, remain interactive, and do not rerender"), so the canvas and the world survive every in-Library navigation. `cacheComponents` is NOT enabled and must not be. The `loading.tsx` files stay (they are the Suspense boundaries `useSearchParams` needs) but render `null`, so no opaque box covers the stage while a page chunk loads. `[locale]/loading.tsx` is untouched.

Pages no longer render `SceneWrapper` or `ExploreStage`. Each page: fetches its data, renders its HUD (`ExploreHud`, panels) absolutely positioned over the stage, and talks to the stage through the store (below). `PageTransition` may stay around the HUD.

### 2.2 Stage store (`src/components/explore/stage/stageStore.ts`, framework-free)

```ts
export interface BookAddress { hex: string; wall: number; shelf: number; volume: number }

export type StageView =
  | { kind: "walk"; hex: string; wall: number }
  | { kind: "shelf"; hex: string; wall: number; shelf: number }
  | { kind: "desk"; book: BookAddress; mode: "index" | "read" };

/** What the volume and reader pages feed the book on the desk. */
export interface DeskInputs {
  title: string;
  spread: number;                                   // 0 in index mode
  contents: Record<number, string>;
  query: string;
  focusToken?: string;
  currentMatch?: { page: number; start: number } | null;
  matchStep?: number;
  mark?: { page: number; start: number; end: number } | null;
  markColor?: string;
  markFocusToken?: string;
  loupe: boolean;
}

export interface StageHandlers {
  onHoverBook?(book: BookRef | null): void;
  onClickBook?(book: BookRef): void;
  onHoverShelf?(wall: number, shelf: number | null): void;
  onClickShelf?(wall: number, shelf: number): void;
  onFacingSide?(side: number): void;
  onPlace?(place: WorldPlace): void;
  onLockChange?(locked: boolean): void;
  onInteract?(): void;
  onHoverIndexPage?(page: number | null): void;
  onClickIndexPage?(page: number): void;
  onHoverTurn?(which: "prev" | "next" | null): void;
  onTurn?(direction: 1 | -1): void;
}

export interface StageSnapshot {
  view: StageView | null;              // requested by the current page
  shelfTitles: { hex: string; wall: number; shelf: number; titles: string[] } | null;
  desk: DeskInputs | null;             // last inputs; never cleared on page unmount
  place: WorldPlace | null;            // gallery the visitor is in (reported by the stage)
  ready: boolean;                      // current world visible (veil gone)
  moving: boolean;                     // a transition is playing
  locked: boolean;                     // mouse captured in walk mode
  origin: { kind: "walk" } | { kind: "shelf"; wall: number; shelf: number } | null; // where the desk book came from
}

export interface StageCommands { lookAt?(yaw: number, pitch?: number): void; skip?(): void }

export interface StageStore {
  getSnapshot(): StageSnapshot;
  subscribe(listener: () => void): () => void;
  setView(view: StageView): void;          // no-op (no emit) when deep-equal to the current view
  setShelfTitles(v: StageSnapshot["shelfTitles"]): void;
  setDesk(inputs: DeskInputs): void;
  patch(partial: Partial<Pick<StageSnapshot, "place" | "ready" | "moving" | "locked" | "origin">>): void; // stage-side reports; no emit when nothing changed
  handlers: { current: StageHandlers };    // latest handlers of the active page (not part of the snapshot)
  commands: StageCommands;                 // registered by the stage
}
export function createStageStore(): StageStore;
```

Snapshots are immutable objects replaced on change (so `useSyncExternalStore` selectors can return stored references).

`src/components/explore/stage/StageProvider.tsx` (client): creates one store per provider mount, provides it via context, and exports hooks:

- `useStageStore(): StageStore`
- `useStageSelector<T>(select: (s: StageSnapshot) => T): T` — `useSyncExternalStore`; selectors must return primitives or stored references.
- `useStageView(view: StageView | null)` — publishes in a layout effect when the view changes by value; nothing on unmount.
- `useStageDesk(inputs: DeskInputs | null)` — same, for desk inputs.
- `useStageHandlers(handlers: StageHandlers)` — assigns `store.handlers.current` in a layout effect every render; on unmount resets it to `{}` only if it still holds this page's object.

Why a store and not props: the pages are siblings of the canvas in the layout, so neither props nor page contexts reach the R3F tree. The canvas bridges contexts from its own parents (`StageProvider`, `NextIntlClientProvider`), so scene components use the same hooks.

### 2.3 The stage (`src/components/explore/stage/LibraryStage.tsx`, `StageScene.tsx`, `Director.tsx`)

`LibraryStage` (client, imported with `next/dynamic` `ssr: false` from a small client wrapper) renders `SceneWrapper` (the existing canvas host with events, post-processing and the veil) with `<StageScene />` inside. `SceneWrapper` gains a controlled `veil` prop so the stage can show the veil again for rebuilds.

`StageScene` owns everything persistent:
- the world (`GalleryWorld`, keyed by `worldHex`), with desks, the constant light pool, the taken-book gap and the shelf-detail wall;
- the book(s) on the desk / in flight (`DeskBook`, keyed by book address; at most two at once during a neighbour swap);
- the camera director;
- `<Loupe active={desk?.loupe && controller is desk/read} />`.

### 2.4 World lifetime

- First view with a hex (walk/shelf hex, desk `book.hex`) and no world → build: `worldHex = hex`, place = level 0 side "a". Visitor pose: walk → `viewpointForSide(wall-1)` facing the wall (as today); shelf/desk → synthesized "standing at the desk": gallery-local point `u·1.9` (u = unit vector of the wall's side), eye height, yaw facing the wall.
- Later view whose hex equals `place.hex` → reuse the world.
- Otherwise → rebuild: veil mounts opaque and the world is rebuilt at the new hex in the same commit, controller placed directly in the target state (no flight), veil fades out when the current gallery cell has loaded (or after 1.5 s).
- The walk view's `wall` only matters when a world is built (the walk page keeps rewriting it with `replaceState` as the visitor turns); it never moves the camera otherwise.

## 3. World changes

### 3.1 Reading desks (`src/components/explore/stage/deskFrame.ts`, `ReadingDesk.tsx`)

Each gallery room has five desks, one on each railing segment facing a wall of shelves (none facing the doorway). Gallery-local frame (unrotated gallery centred at the origin, floor y = 0), wall index i = wall − 1, `a = sideAngle(i)`, `u = (cos a, 0, sin a)`:

```ts
export const DESK = { width: 0.8, depth: 0.4, top: 0.97, board: 0.035 } as const;
export const RAIL_APOTHEM = ROOM.railRadius * Math.cos(Math.PI / 6);   // 1.0566
// desk centre (top surface): u * (RAIL_APOTHEM + DESK.depth / 2) at y = DESK.top
```

The desk stands in the band between the railing and the walker's minimum radius (`ROOM.railRadius + 0.32 = 1.54`, see `clampRoom` in `geometry.ts`), so walking is unchanged: every desk corner must satisfy `hypot < 1.54 − 0.02` (unit-tested). Geometry: board `0.8 × 0.035 × 0.4` in `materials.woodDark`, two iron brackets down to the rail, a small brass lamp (base, stem, globe r ≈ 0.035) at desk-local x = +0.33, z = −0.12, height 0.3. Only the lamp of the active desk glows (its globe uses `materials.lamp`, the others a dim material). Far levels (`DistantLevel`) get no desks.

### 3.2 Book frame and scale

The desk book keeps the reader's "book space" (units of `ReaderScene`: `PAGE = { w: 1.42, d: 2.0 }`, `COVER_TOP = 0.05`, cover `3.02 × 2.14`, blocks `0.015..0.12`, spine along z at x = 0, reader at +z, texture tops at −z). Book space maps to the world by

```ts
export const BOOK_SCALE = 0.15; // cover 2.14 → 0.321 m, like a shelf volume (CASE.bookH = 0.32)
export interface DeskFrame { position: THREE.Vector3; yaw: number; scale: number }
// world = position + R_y(yaw) · (scale · p_book)
```

For desk i of the gallery at (level, side): `position` = world point of the desk centre top; `yaw = atan2(u.x, u.z) + galleryRotation(side)` (book +z points at the wall, where the reader stands). Helpers (pure, unit-tested): `deskFrame(level, side, wall)`, `bookToWorld(frame, p, out)`, `worldToBook(frame, p, out)`, `bookDirToWorld`, `readerHomeShot(frame)` (from `HOME_POSITION`/`HOME_TARGET`), `visitorAtDesk(level, side, wall)`, `closeupShot(level, side, wall, shelf)` (from `closeupForSide(i, 2.6)` with the eye clamp and pitch of today's `ShelfView`).

Camera near plane: 0.05 in walk/shelf, `0.02 · BOOK_SCALE = 0.003` at the desk (the reader's own near scaled), interpolated during transitions. If the far world z-fights visibly at the desk, raise to 0.006 and clamp the minimum distance accordingly.

### 3.3 Shelf volumes and the taken book

Extract the deterministic placement loop of `Bookcase` into an exported pure function `planBookcase(seed, wall, detailShelf?)` returning `{ groups, placements }` (placements carry shelf, volume, x, y, z, scaleY, tint); `Bookcase` uses it. `shelfBookMatrix(level, side, wall, shelf, volume, seed)` (pure) composes gallery transform × bookcase transform (`position = u·(ROOM.apothem − 0.012)`, `rotationY = facingCenterRotation(a)`) × book box (centre, scale `(1, scaleY, 1)`).

A closed desk book lying in book space occupies x ∈ [0, 1.51], y ∈ [0, T] with `T = 2·COVER_TOP + hl + hr = 0.235` (constant: `hl + hr = 0.135`), z ∈ [−1.07, 1.07]. On the shelf it stands with the spine to the room and the head up. The rotation from book space to bookcase space maps book +x → case −z, book +y → case +x, book +z → case −y (right-handed: X × Y = Z). Book-space origin → case point `(book.x − CASE.bookW/2, book.y, 0.02 + CASE.bookD)`. Because the shelf volume is thicker (0.10 m) and deeper (0.24 m) than the closed desk book (0.035 m, 0.2265 m), the shelf pose carries a non-uniform correction scale `(CASE.bookD / (1.51·S), CASE.bookW / (T·S), CASE.bookH·scaleY / (2.14·S))` in book axes (S = `BOOK_SCALE`, `scaleY` = the volume's height jitter), tweened to `(1, 1, 1)` during the flight. Unit test: the eight corners of the closed book placed at the shelf pose coincide with the instanced box's corners within 5 mm.

`Bookcase` gains `hidden?: { shelf: number; volume: number }`: that instance is written with zero scale (and a `DetailedBook` for it is not rendered). The stage passes it to the bookcase of the book's wall in the current gallery cell while the book is off the shelf.

### 3.4 Shelf close-up inside the world

`ShelfView` and `HexGalleryScene`'s `mode="shelf"` are removed. In shelf state the current gallery's bookcase of that wall receives `detail = { shelf, titles }` and `focusShelf`, a spot light lights the shelf (values of today's `ShelfSpot`), and the camera sits at the close-up shot with look-only controls (yaw range ±0.55 around the wall, pitch ±0.45, fov range 26..62, initial fov 50). Clicking another plank publishes another shelf route (glide between close-ups); clicking a volume of the focused shelf takes it.

### 3.5 Lights: constant count

`LightPool` keeps its 9 point lights and gains, permanently: one desk point light (`LAMP_COLOR`, distance 3, decay 2, positioned at the active desk lamp, intensity 0 when no book is on a desk, ≈ 0.6 at rest, tuned by eye) and one spot light with its target (shelf spot, intensity 0 outside shelf state). Light intensities may animate; the number and kinds of lights never change (no shader recompiles). Verify `gl.info.programs.length` stays constant across all transitions.

### 3.6 Controls

`GalleryControls` gains imperative methods on its handle; its listener effect keeps depending only on `gl, events, walk, pointerLock` (changing them releases a captured mouse):

```ts
setActive(active: boolean): void;   // false: releases capture, ignores input, stops writing the camera
configure(o: { walk: boolean; capture: boolean; yawRange?: [number, number]; pitchRange: [number, number]; fovRange: [number, number] }): void; // read through refs
getPose(): { position: THREE.Vector3; yaw: number; pitch: number; fov: number };
```

Desk state uses `OrbitControls` inside `DeskBook` (enabled only in desk state) with limits converted from book space: `min/maxDistance × BOOK_SCALE`, polar limits unchanged, azimuth limits `±0.95 + yaw` (normalised; OrbitControls supports wrapped ranges), target clamp done in book space (`VIEW_BOUNDS`), glide targets and the overview drift computed in book space and mapped to the world. WASD/↑↓ glides work in world units unchanged (speeds are distance-based).

## 4. The desk book (`src/components/explore/stage/DeskBook.tsx`)

`ReaderScene` becomes `DeskBook`: the reader's book (leaves, sheets, page texture cache, glides, keys, hover/turn) plus:

- props `{ book: BookAddress; frame: DeskFrame; mode: "index" | "read"; inputs: DeskInputs; controlsEnabled: boolean; interactive: boolean; pose?: BookPose; openness: number }` where `pose`/`openness` are driven by the director during flights (see 5), and `openness = 1` at rest;
- index mode: the right page of spread 0 shows the index page (`makeIndexPage`) instead of page 1, with today's `VolumeScene` hover highlight and click (`indexCellFromUv`) → `handlers.onHoverIndexPage/onClickIndexPage`; clicks only when the leaves are settled at spread 0 and nothing is moving;
- read mode: as today's reader; `handlers.onHoverTurn/onTurn/onInteract`;
- hinged covers: the cover board is two halves around the spine; the front (left) half with the left block, left page and bookmark rotates about the z-axis through `(0, COVER_TOP + (hl + hr)/2)` by `−π·(1 − openness)`; the spine rotates by half that angle; sheets in the air are hidden while `openness < 1`;
- `window.__reader` dev hook kept (same fields) for the active book.

`VolumeScene.tsx` (its `ReadingTable` and camera rig) and the reader's `CameraRig` are removed; `Bookmark`, `useTitlePageText` move next to `DeskBook`.

## 5. Director and transitions

### 5.1 Controller state

```ts
type Controller =
  | { kind: "walk" }
  | { kind: "shelf"; wall: number; shelf: number }
  | { kind: "desk"; book: BookAddress; mode: "index" | "read" };
```

Pure decision function (`src/components/explore/stage/transitions.ts`, unit-tested):

```ts
export type Transition =
  | { kind: "none" }
  | { kind: "build" }                                    // no world yet
  | { kind: "rebuild" }                                  // hex differs from place.hex
  | { kind: "glide"; to: "walk" | "shelf" }             // walk↔shelf, shelf↔shelf
  | { kind: "take"; book: BookAddress; from: "walk" | "shelf" }
  | { kind: "return"; to: "walk" | "shelf" }             // desk → walk/shelf
  | { kind: "mode"; mode: "index" | "read" }             // same book
  | { kind: "swap"; book: BookAddress };                 // desk → desk, other book
export function decideTransition(controller: Controller | null, placeHex: string | null, view: StageView): Transition;
```

Rules: no controller → build; view hex ≠ placeHex → rebuild; walk→walk none; walk→shelf glide; walk→desk take(from walk); shelf→walk glide; shelf→shelf (other shelf or wall) glide; shelf→desk take(from shelf); desk→walk return(walk); desk→shelf return(shelf) (if the shelf is not the book's own, the return lands the book on its own shelf and the camera goes to the requested close-up); desk→desk same book → mode (or none if same mode); desk→desk other book → swap.

Visitor pose: saved from `GalleryControls.getPose()` whenever walk is left; restored with `teleport` when walk is entered. Origin (`store.patch({ origin })`): set on take (walk, or shelf with wall/shelf), `{ kind: "walk" }` on build/rebuild into desk.

Click-started takes: `onClickBook` from walk/shelf state starts the take immediately (with the clicked instance's world matrix as the start pose) and calls the page's `handlers.onClickBook` (which pushes the route). The page's desk view confirms it; if no matching desk view arrives within 3 s, the director reverses to the current view.

While `moving`: world clicks and book hover are ignored; the page HUD still works (a new view retargets). Pointer capture is released at the start of any transition out of walk.

### 5.2 Timelines (`src/components/explore/stage/timeline.ts`, pure, unit-tested)

```ts
export interface CameraShot { position: THREE.Vector3; target: THREE.Vector3; fov: number; near: number }
export interface BookPose { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 } // of the closed book's centre
export interface StageFrame { camera: CameraShot; book: BookPose | null; openness: number; deskLight: number }
export interface Timeline { duration: number; sample(t: number, out?: StageFrame): StageFrame }

export function takeTimeline(i: { cameraFrom: CameraShot; bookFrom: BookPose; bookTo: BookPose; shelfNormal: THREE.Vector3; cameraTo: CameraShot; seed: number }): Timeline;
export function returnTimeline(i: { cameraFrom: CameraShot; bookFrom: BookPose; bookTo: BookPose; shelfNormal: THREE.Vector3; cameraTo: CameraShot; seed: number }): Timeline;
export function glideTimeline(from: CameraShot, to: CameraShot, duration?: number): Timeline;
export function reversed(timeline: Timeline, from: number): Timeline;   // sample(τ) = timeline.sample(from − τ), duration = from
export function scaled(timeline: Timeline, factor: number): Timeline;    // reduced motion
export const DURATION = { take: 2.0, return: 1.8, glide: 0.9, swapGap: 0.15, reducedMotion: 0.35 } as const;
```

Take (seconds): 0–0.30 slide out along the shelf normal by 0.26 m; 0.20–1.10 cubic Bézier flight to 0.12 m above the desk (control points: start + normal·0.5 + up·0.35, end + up·0.45 + toward-wall·0.2), quaternion slerp from the shelf pose to the desk pose with a small seeded roll mid-flight, scale correction tweened to 1; 1.10–1.35 settle down with ease-out; 1.25–1.95 openness 0 → 1; desk light 0 → 1 over 1.2–1.9. Camera 0.10–1.95: position along a Bézier that lifts 0.1 m and swings around on the side opposite the book's path; target = blend from the flying book's position to the final target (smoothstep over the last 40 %); fov and near interpolated. Return mirrors it: openness 1 → 0 over 0–0.55, lift 0.45–0.70, flight 0.60–1.50, slide in 1.45–1.75, camera from wherever the orbit is to the visitor/close-up shot over 0–1.75. Glide: position Bézier with a slight lift, target and fov eased. Swap = return(A) then take(B), both × (1/1.5), gap 0.15 s. Its camera cannot be held at the desk home shot: that shot hangs a hand's breadth over the open book, so each flight would leave the frame the moment its book left the desk. It draws back instead, to the desk's watch shot — 1.8 m back from the desk over the shaft, 0.6 m above its top, looking at a point 0.2 m towards the wall and 0.65 m up, through the walker's lens — which holds the desk and the whole height of the wall behind it. From wherever the reader left it, the camera is there by 80 % of return(A), waits through the landing, the gap and the neighbour's take-off, and comes home over the last 70 % of take(B), as the new book settles and opens. Both legs are eased with smoothstep, not the flights' cubic, whose middle is twice as fast: over two metres in under a second that would be a lurch.

Continuity requirements (tested): `sample(0)` equals the start poses and `sample(duration)` the end poses exactly; poses are continuous (no jump > 2 cm or 3° between samples 1/120 s apart); `reversed(tl, t).sample(τ)` equals `tl.sample(t − τ)`.

### 5.3 Director runtime (`Director.tsx`)

Each frame while a timeline plays: advance `t` by `dt × timeScale` (dev hook `window.__stage.setTimeScale`), sample, write the camera (position, `lookAt(target)`, fov, near → `updateProjectionMatrix`), the flying book pose/openness, the desk light; at the end hand control to the target controller (walk: `teleport` + `setActive(true)`; shelf: configure look mode + `teleport`; desk: OrbitControls target/position set to the home shot, `controlsEnabled`). Skip = jump to `t = duration`. A new view mid-transition: if it equals the transition's origin → `reversed(current, t)`; otherwise finish the current one instantly and start the new one. `store.patch({ moving })` at start/end.

Milestone 1 uses the same director with zero-duration transitions (instant cuts); milestone 2 plugs in the timelines.

### 5.4 Index ↔ read page turns

Index → read(k): set the desk target spread to k; the leaves engine already lifts queued turns as bunches. While the book is coming from index mode, page 1's front texture stays the index until the leaf lands on the left. Long jumps must finish within ~1.2 s: when `|k − current| > 12` use a faster `TurnParams` set. Read → index: turn back to spread 0; page 1 shows the index as it lands. Reader keyboard ←/→ at spread 0 in index mode does nothing.

## 6. Pages after the change

- **walk**: publishes `{ kind: "walk", hex, wall }`; handlers as today's callbacks (`onPlace`, `onFacingSide`, hovers, clicks → `router.push`); `selectWall` → `store.commands.lookAt`; `ready`/`locked` from the snapshot.
- **shelf**: fetches titles, publishes `{ kind: "shelf", … }` and `setShelfTitles`; HUD back → walk URL.
- **volume**: fetches the title, publishes `{ kind: "desk", mode: "index" }` + desk inputs `{ title, spread: 0, contents: {}, query: "", loupe: false }`; handlers `onHoverIndexPage/onClickIndexPage`; HUD back from `origin`; random page button as today.
- **reader**: all current state stays in the page; publishes `{ kind: "desk", mode: "read" }` + desk inputs every change; `useLoupe()` stays in the page (`loupe: loupe.active`); `go()` as today (neighbour → `router.push`).

## 7. Errors and edge cases

- Unknown/invalid address pages render their message over the dark stage; no view is published.
- Navigation away from the Library unmounts the layout: canvas, textures and listeners are disposed as today.
- Locale switch remounts `[locale]` and therefore the stage (veil, fresh world).
- Pointer lock refused (Claude desktop browser pane): the free-mouse fallback keeps working; the director must also release it (`setCenterAim(false)`).
- Keys: check `e.key` as well as `e.code` (embedded browsers send an empty `code`).
- Page textures: never dispose textures of pages still turning (the old flicker bug).
- Titles or page contents arriving late just redraw textures (keys include them).
- WebGL context loss: out of scope (unchanged).

## 8. Testing and verification

- Vitest (`npm test`): `stageStore`, `transitions`, `deskFrame` (desk corners outside the walkable area, frame round trips, shelf pose corner test), `timeline` (end poses, continuity, reversal), existing suites stay green. `npm run typecheck` and `npm run lint` clean.
- Browser: the user runs `npm run dev` on port 3000 from their own terminal — do not start another server. The Claude desktop browser pane pauses `requestAnimationFrame` while hidden, so verify motion in real Chrome through the chrome-devtools MCP (`new_page`/`navigate_page` to `http://localhost:3000/…`, `select_page` with `bringToFront`, `evaluate_script`, `take_screenshot`). Dev hook `window.__stage = { store, setTimeScale(x), state() }` (development only); `setTimeScale(0)` freezes a transition for mid-flight screenshots. Dev log: `.next/dev/logs/next-development.log`.
- Scenarios: walk → book → index → page → back → back; walk → shelf → book → back → back; direct links to each of the four URLs and back; browser back mid-flight; skip by click; neighbour volume past the last page; loupe, text panel, search, fragments at the desk; `gl.info.programs.length` constant across transitions; no console errors.

## 9. Milestones

1. **One canvas** (instant cuts): store/provider, route group + layout, persistent world with shelf close-up and desks, constant lights, taken-book gap, `DeskBook` at real scale with index mode, director with zero-length transitions, pages ported.
2. **Flights**: timelines, hinged covers and flying book, camera choreography, skip, reverse, reduced motion, desk light, neighbour swap.
3. **Polish**: index ↔ page bunch turns, hints in `messages/ru.json` and `messages/en.json`, both READMEs.

Project rules for all work: no git commits or pushes unless the user asks; keep shell commands simple (no `cd … &&` chains, no inline heredoc scripts — write helper scripts with the Write tool into the session scratchpad); Bash commands over ~8 KB get truncated.
