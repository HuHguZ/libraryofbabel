# Seamless Book Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the walk, shelf, volume-index and reader routes of the Library on one persistent WebGL canvas, with the book flying from its shelf to a reading desk at the shaft railing and back, and seamless camera transitions in both directions.

**Architecture:** A route group `(library)` with a layout that owns a single R3F canvas (`LibraryStage`) and a framework-free store (`stageStore`). Pages become HUD + data publishers; the stage keeps the world alive, renders desks and the desk book at real scale, and a director plays transitions decided by a pure `decideTransition` and sampled from pure timelines.

**Tech Stack:** Next.js 16.3 App Router (Turbopack), React 19.2, @react-three/fiber 9.7, @react-three/drei 10.7, three 0.186, @react-three/postprocessing 3, next-intl 4, Chakra UI 3, motion 13, TypeScript 6, Vitest 5 (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-16-seamless-book-transitions-design.md` — read it fully before any task; section numbers below refer to it.

## Global Constraints

- No new npm dependencies. React stays `~19.2` (R3F 9.7 forbids 19.3).
- **No git commits or pushes** (the user commits only when they ask). `git mv` for moves is fine.
- URLs, query parameters and both locales (`ru` unprefixed, `en` prefixed) stay exactly as they are.
- Number and kinds of lights in the scene never change after the stage mounts (spec 3.5).
- `GalleryControls`' listener effect keeps its dependency list `[gl, events, walk, pointerLock]`; mode changes go through refs (spec 3.6).
- Callbacks fired from the render loop read current state from refs, never from memoised closures.
- Keep `window.__reader` (dev only) and add `window.__stage` (dev only).
- Comments follow the surrounding code: short, explain why, British spelling ("colour", "neighbour").
- Shell: one simple command per call with absolute paths, no `cd … &&` chains, no inline heredoc/python scripts; write helper scripts with the Write tool into `C:\Users\user\AppData\Local\Temp\claude\C--Users-user-Desktop-work-libraryofbabel\cf144996-56b9-41e7-83ae-f900119574ae\scratchpad`. Bash commands longer than ~8 KB are truncated.
- The user runs `npm run dev` on port 3000 from their own terminal. Never start or stop a dev server. Its log: `.next/dev/logs/next-development.log`.
- Browser checks: real Chrome via the chrome-devtools MCP tools (load them with ToolSearch, e.g. `select:mcp__chrome-devtools__new_page,mcp__chrome-devtools__navigate_page,mcp__chrome-devtools__select_page,mcp__chrome-devtools__evaluate_script,mcp__chrome-devtools__take_screenshot,mcp__chrome-devtools__list_console_messages,mcp__chrome-devtools__click`). Bring the page to front (`select_page` with `bringToFront: true`) or Chrome renders ~1 fps. The Claude desktop browser pane pauses `requestAnimationFrame` while hidden — don't use it to judge motion. Use a short gallery address: `http://localhost:3000/explore/wall/3?hex=babel`.
- Every task ends with `npm run typecheck`, `npm run lint` and `npm test` all passing (run each as its own command from the project root `C:\Users\user\Desktop\work\libraryofbabel`).

## File map

New (all under `src/components/explore/stage/` unless noted):
- `stageStore.ts` (+ test) — store and types (spec 2.2)
- `transitions.ts` (+ test) — `decideTransition` (spec 5.1)
- `StageProvider.tsx` (+ test) — context and hooks
- `bookSpace.ts` — reader book-space constants moved out of `ReaderScene.tsx`
- `poses.ts` — `CameraShot`, `BookPose`, `WalkPose` types
- `deskFrame.ts` (+ test) — desks, frames, shots, shelf poses (spec 3.1–3.3)
- `src/components/explore/bookcasePlan.ts` — pure placement of volumes, `CASE` and friends moved out of `Bookcase.tsx`
- `timeline.ts` (+ test) — take/return/glide timelines (spec 5.2)
- `LibraryStageClient.tsx`, `LibraryStage.tsx`, `StageScene.tsx`, `Director.tsx`, `ReadingDesk.tsx`, `DeskBook.tsx`
- `src/app/[locale]/(library)/layout.tsx`

Moved: `src/app/[locale]/explore/**` and `src/app/[locale]/page/**` into `src/app/[locale]/(library)/`.

Removed by the end: `src/components/explore/VolumeScene.tsx`, `src/components/explore/ReaderScene.tsx` (merged into `DeskBook.tsx`), `ShelfView` inside `HexGalleryScene.tsx`.

## Task order and parallelism

1 and 2 are independent (run in parallel). 3 needs 1. 7 needs 2 (can run in parallel with 3–6). 4 needs 2 and 3. 5 needs 4. 6 needs 5. 8 needs 6 and 7. 9 needs 8. 10 needs 9.

---

### Task 1: Stage store, transition rules and provider hooks

**Files:**
- Create: `src/components/explore/stage/stageStore.ts`, `src/components/explore/stage/stageStore.test.ts`
- Create: `src/components/explore/stage/transitions.ts`, `src/components/explore/stage/transitions.test.ts`
- Create: `src/components/explore/stage/StageProvider.tsx`, `src/components/explore/stage/StageProvider.test.tsx`

**Interfaces:**
- Consumes: `BookRef` from `src/components/explore/Bookcase.tsx`, `WorldPlace` from `src/components/explore/HexGalleryScene.tsx` (type-only imports).
- Produces: everything in spec 2.2 verbatim (`BookAddress`, `StageView`, `DeskInputs`, `StageHandlers`, `StageSnapshot`, `StageCommands`, `StageStore`, `createStageStore`), `sameView(a, b): boolean`, spec 5.1 `Controller`, `Transition`, `decideTransition`, and hooks `StageProvider`, `useStageStore`, `useStageSelector`, `useStageView`, `useStageDesk`, `useStageHandlers`.

Equality rules: `setView` and `patch` do not emit when nothing changes by value (views compared with `sameView`; `place` and `origin` by value). `setDesk` emits when any field differs: `contents` by reference, `currentMatch` and `mark` by value, everything else with `Object.is`. `setShelfTitles` compares hex/wall/shelf by value and `titles` element-wise.

- [ ] **Step 1: Write the failing store tests**

```ts
// src/components/explore/stage/stageStore.test.ts
import { describe, expect, it, vi } from "vitest";
import { createStageStore, sameView, type DeskInputs } from "./stageStore";

const desk = (over: Partial<DeskInputs> = {}): DeskInputs => ({ title: "t", spread: 0, contents: {}, query: "", loupe: false, ...over });

describe("createStageStore", () => {
  it("starts empty", () => {
    expect(createStageStore().getSnapshot()).toEqual({
      view: null, shelfTitles: null, desk: null, place: null, ready: false, moving: false, locked: false, origin: null,
    });
  });

  it("emits once per real change of the view", () => {
    const store = createStageStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setView({ kind: "walk", hex: "babel", wall: 3 });
    store.setView({ kind: "walk", hex: "babel", wall: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    store.setView({ kind: "walk", hex: "babel", wall: 4 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the snapshot object when a patch changes nothing", () => {
    const store = createStageStore();
    const before = store.getSnapshot();
    store.patch({ ready: false, origin: null });
    expect(store.getSnapshot()).toBe(before);
    store.patch({ ready: true });
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().ready).toBe(true);
  });

  it("compares places and origins by value", () => {
    const store = createStageStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.patch({ place: { level: 1, side: "b", hex: "x" }, origin: { kind: "shelf", wall: 2, shelf: 5 } });
    store.patch({ place: { level: 1, side: "b", hex: "x" }, origin: { kind: "shelf", wall: 2, shelf: 5 } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("compares desk contents by reference and matches by value", () => {
    const store = createStageStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const contents = { 1: "abc" };
    store.setDesk(desk({ contents, currentMatch: { page: 1, start: 2 } }));
    store.setDesk(desk({ contents, currentMatch: { page: 1, start: 2 } }));
    expect(listener).toHaveBeenCalledTimes(1);
    store.setDesk(desk({ contents: { 1: "abc" }, currentMatch: { page: 1, start: 2 } }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createStageStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.patch({ moving: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps handlers and commands outside the snapshot", () => {
    const store = createStageStore();
    const before = store.getSnapshot();
    store.handlers.current = { onTurn: () => {} };
    store.commands.skip = () => {};
    expect(store.getSnapshot()).toBe(before);
  });
});

describe("sameView", () => {
  it("compares desk views deeply", () => {
    const book = { hex: "babel", wall: 2, shelf: 3, volume: 7 };
    expect(sameView({ kind: "desk", book, mode: "read" }, { kind: "desk", book: { ...book }, mode: "read" })).toBe(true);
    expect(sameView({ kind: "desk", book, mode: "read" }, { kind: "desk", book, mode: "index" })).toBe(false);
    expect(sameView({ kind: "shelf", hex: "babel", wall: 2, shelf: 3 }, { kind: "walk", hex: "babel", wall: 2 })).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing transition tests**

```ts
// src/components/explore/stage/transitions.test.ts
import { describe, expect, it } from "vitest";
import { decideTransition, type Controller } from "./transitions";
import type { StageView } from "./stageStore";

const book = { hex: "babel", wall: 2, shelf: 3, volume: 7 };
const other = { ...book, volume: 8 };
const walk: Controller = { kind: "walk" };
const shelf: Controller = { kind: "shelf", wall: 2, shelf: 3 };
const deskIndex: Controller = { kind: "desk", book, mode: "index" };
const deskRead: Controller = { kind: "desk", book, mode: "read" };
const vWalk: StageView = { kind: "walk", hex: "babel", wall: 1 };

describe("decideTransition", () => {
  it.each([
    ["no world yet", null, null, vWalk, { kind: "build" }],
    ["another gallery", walk, "babel", { ...vWalk, hex: "elsewhere" }, { kind: "rebuild" }],
    ["walk, turning to another wall", walk, "babel", { ...vWalk, wall: 4 }, { kind: "none" }],
    ["walk to a shelf", walk, "babel", { kind: "shelf", hex: "babel", wall: 2, shelf: 3 }, { kind: "glide", to: "shelf" }],
    ["walk to a book", walk, "babel", { kind: "desk", book, mode: "index" }, { kind: "take", book, from: "walk" }],
    ["shelf back to walk", shelf, "babel", vWalk, { kind: "glide", to: "walk" }],
    ["shelf to another shelf", shelf, "babel", { kind: "shelf", hex: "babel", wall: 2, shelf: 4 }, { kind: "glide", to: "shelf" }],
    ["same shelf", shelf, "babel", { kind: "shelf", hex: "babel", wall: 2, shelf: 3 }, { kind: "none" }],
    ["shelf to a book", shelf, "babel", { kind: "desk", book, mode: "index" }, { kind: "take", book, from: "shelf" }],
    ["book back to walk", deskIndex, "babel", vWalk, { kind: "return", to: "walk" }],
    ["book back to the shelf", deskIndex, "babel", { kind: "shelf", hex: "babel", wall: 2, shelf: 3 }, { kind: "return", to: "shelf" }],
    ["index to a page", deskIndex, "babel", { kind: "desk", book, mode: "read" }, { kind: "mode", mode: "read" }],
    ["same page view", deskRead, "babel", { kind: "desk", book, mode: "read" }, { kind: "none" }],
    ["neighbour volume", deskRead, "babel", { kind: "desk", book: other, mode: "read" }, { kind: "swap", book: other }],
    ["book of another gallery", deskRead, "babel", { kind: "desk", book: { ...book, hex: "elsewhere" }, mode: "read" }, { kind: "rebuild" }],
  ] as const)("%s", (_name, controller, placeHex, view, expected) => {
    expect(decideTransition(controller, placeHex, view)).toEqual(expected);
  });
});
```

- [ ] **Step 3: Run both test files and see them fail**

Run: `npx vitest run src/components/explore/stage/stageStore.test.ts src/components/explore/stage/transitions.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `stageStore.ts` and `transitions.ts`** exactly as the interfaces above and spec 2.2 / 5.1. The store keeps `listeners: Set`, replaces `snapshot` with a new frozen-by-convention object on change, and exposes `handlers = { current: {} }` and `commands = {}`. `decideTransition(controller, placeHex, view)`: `controller === null` → build; view hex (`view.kind === "desk" ? view.book.hex : view.hex`) !== `placeHex` → rebuild; then the table in spec 5.1.

- [ ] **Step 5: Run the two test files; expect PASS.**

- [ ] **Step 6: Write the failing provider test**

```tsx
// src/components/explore/stage/StageProvider.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { useEffect } from "react";
import { StageProvider, useStageHandlers, useStageStore, useStageView } from "./StageProvider";
import type { StageStore, StageView } from "./stageStore";

function Probe({ view, onStore, handlers }: { view: StageView; onStore: (s: StageStore) => void; handlers: object }) {
  const store = useStageStore();
  useStageView(view);
  useStageHandlers(handlers);
  useEffect(() => onStore(store), [store, onStore]);
  return null;
}

describe("StageProvider hooks", () => {
  it("publishes the view by value and clears only its own handlers", () => {
    let store: StageStore | null = null;
    const handlersA = { onTurn: () => {} };
    const { rerender, unmount } = render(
      <StageProvider>
        <Probe view={{ kind: "walk", hex: "babel", wall: 3 }} onStore={(s) => (store = s)} handlers={handlersA} />
      </StageProvider>
    );
    const first = store!.getSnapshot();
    expect(first.view).toEqual({ kind: "walk", hex: "babel", wall: 3 });
    rerender(
      <StageProvider>
        <Probe view={{ kind: "walk", hex: "babel", wall: 3 }} onStore={(s) => (store = s)} handlers={handlersA} />
      </StageProvider>
    );
    expect(store!.getSnapshot()).toBe(first);
    expect(store!.handlers.current).toBe(handlersA);
    unmount();
    expect(store!.handlers.current).toEqual({});
  });
});
```

- [ ] **Step 7: Run it (FAIL), implement `StageProvider.tsx`** ("use client"; `const StageContext = createContext<StageStore | null>(null)`; `StageProvider` creates the store with `useState(() => createStageStore())`; `useStageStore` throws outside a provider; `useStageSelector(select)` = `useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()), () => select(store.getSnapshot()))`; `useStageView`/`useStageDesk` publish in `useLayoutEffect` keyed on the value (let the store's equality decide); `useStageHandlers` assigns in `useLayoutEffect` without deps and resets to `{}` on unmount only if `store.handlers.current` is still this component's latest object). **Run it; expect PASS.**

- [ ] **Step 8: Run `npm run typecheck`, `npm run lint`, `npm test`; all pass.**

---

### Task 2: Book space, bookcase plan, desk frames and shelf poses

**Files:**
- Create: `src/components/explore/bookcasePlan.ts`
- Modify: `src/components/explore/Bookcase.tsx` (import and re-export `CASE`, `BookRef`, `shelfPlankY`, `bookSpacing`, `bookLocalPosition` from `bookcasePlan.ts`; replace the in-component placement loop with `planBookcase`)
- Modify: `src/components/explore/materials.tsx` (import `TINT_GROUPS` from `bookcasePlan.ts` and re-export it)
- Create: `src/components/explore/stage/bookSpace.ts`
- Modify: `src/components/explore/ReaderScene.tsx` (import the moved constants from `stage/bookSpace.ts`; behaviour unchanged)
- Create: `src/components/explore/stage/poses.ts`
- Create: `src/components/explore/stage/deskFrame.ts`, `src/components/explore/stage/deskFrame.test.ts`

**Interfaces:**
- Produces (`bookcasePlan.ts`, no imports of React, R3F, drei, next-intl or `materials.tsx`): `CASE`, `BookRef`, `TINT_GROUPS = 8`, `shelfPlankY(shelf)`, `bookSpacing()`, `bookLocalPosition(shelf, volume, scaleY?)`, `interface BookPlacement { shelf; volume; tint; x; y; z; scaleY }`, `planBookcase(seed: number, wall: number, detailShelf?: number): { groups: { tint: number; books: BookPlacement[] }[]; tintOf: Map<string, number>; placements: BookPlacement[] }` — same random sequence as today's loop in `Bookcase.tsx` (`createRandom(seed * 7919 + wall * 104729)`, tint switch at `rand() > 0.72`, `scaleY = 0.97 + rand() * 0.06`); `placements` has all 7×32 volumes including the detail shelf, `groups` excludes the detail shelf.
- Produces (`bookSpace.ts`, moved verbatim from `ReaderScene.tsx`): `COVER_TOP = 0.05`, `GUTTER = 0.035`, `PAGE_LIFT`, `RIBBON_LIFT`, `FLIP_LIFT`, `HOME_POSITION`, `HOME_TARGET`, `VIEW_BOUNDS`, `OVERVIEW_DISTANCE`, `MIN_DISTANCE`, `MAX_DISTANCE`, `blockHeights(turned)`, plus new `COVER = { w: 3.02, d: 2.14 }`, `SPINE = { w: 0.07, h: 0.13, d: 2.1 }`, `READER_FOV = 44`, `READER_NEAR = 0.02`, `CLOSED_THICKNESS = 2 * COVER_TOP + 0.135`, `CLOSED_CENTER = new THREE.Vector3(COVER.w / 4, CLOSED_THICKNESS / 2, 0)`.
- Produces (`poses.ts`): `interface CameraShot { position: THREE.Vector3; target: THREE.Vector3; fov: number; near: number }`, `interface BookPose { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }` (pose of the closed book's centre; `scale` is the correction in book axes), `interface WalkPose { position: THREE.Vector3; yaw: number; pitch: number }`.
- Produces (`deskFrame.ts`): `DESK`, `RAIL_APOTHEM`, `BOOK_SCALE = 0.15`, `WALK_NEAR = 0.05`, `DeskFrame`, `deskCenterLocal(wall)`, `deskCorners(wall)`, `galleryToWorld(level, side, p, out?)`, `galleryYaw(side)`, `deskFrame(level, side, wall)`, `bookToWorld(frame, p, out?)`, `worldToBook(frame, p, out?)`, `bookDirToWorld(frame, d, out?)`, `readerHomeShot(frame): CameraShot` (fov `READER_FOV`, near `READER_NEAR * frame.scale`), `deskLampLocal(wall)` (gallery-local lamp globe position), `visitorAtDesk(level, side, wall): WalkPose` (r = 1.9, eye `ROOM.eyeHeight`, pitch −0.04), `walkShot(pose: WalkPose, fov: number): CameraShot` (target = position + forward of yaw/pitch with `rotation.order = "YXZ"` semantics, near `WALK_NEAR`), `closeupPose(level, side, wall, shelf): { pose: WalkPose; yawRange: [number, number] }` (today's `ShelfView` camera memo, translated to the world), `shelfBookPose(level, side, wall, shelf, volume, seed): BookPose`, `deskBookPose(frame): BookPose`, `bookMatrix(pose: BookPose, out?: THREE.Matrix4): THREE.Matrix4` (= T(position)·R(quaternion)·S(BOOK_SCALE)·S(scale)·T(−CLOSED_CENTER)).

Conventions (spec 3.2–3.3): gallery-local → world is `galleryCenter(side, level)` + rotation about y by `galleryRotation(side)`; three.js rotation.y by θ maps local +z to `(sin θ, 0, cos θ)`, so a frame whose book +z points along `u` has `yaw = atan2(u.x, u.z)`. Shelf pose rotation (book → bookcase space) has columns X → (0,0,−1), Y → (1,0,0), Z → (0,−1,0); the book-space origin lands at `(x − CASE.bookW/2, y, 0.02 + CASE.bookD)` of the bookcase; correction scale `(CASE.bookD / (COVER.w/2 · S), CASE.bookW / (CLOSED_THICKNESS · S), CASE.bookH · scaleY / (COVER.d · S))`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/explore/stage/deskFrame.test.ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ROOM, closeupForSide, galleryCenter, galleryRotation, sideAngle, sideYaw, facingCenterRotation } from "../geometry";
import { CASE, planBookcase, shelfPlankY } from "../bookcasePlan";
import { hashString } from "@/lib/hex";
import { COVER, CLOSED_THICKNESS, HOME_POSITION, HOME_TARGET } from "./bookSpace";
import {
  BOOK_SCALE, RAIL_APOTHEM, bookMatrix, bookToWorld, closeupPose, deskBookPose, deskCorners, deskFrame,
  readerHomeShot, shelfBookPose, visitorAtDesk, worldToBook,
} from "./deskFrame";

const near = (a: THREE.Vector3, b: THREE.Vector3, eps: number) => expect(a.distanceTo(b)).toBeLessThan(eps);

describe("reading desks", () => {
  it("stand between the railing and where a walker can go", () => {
    for (let wall = 1; wall <= 5; wall++) {
      for (const c of deskCorners(wall)) {
        const r = Math.hypot(c.x, c.z);
        expect(r).toBeLessThan(ROOM.railRadius + 0.32 - 0.02);
        const u = new THREE.Vector3(Math.cos(sideAngle(wall - 1)), 0, Math.sin(sideAngle(wall - 1)));
        expect(c.x * u.x + c.z * u.z).toBeGreaterThanOrEqual(RAIL_APOTHEM - 1e-9);
      }
    }
  });

  it("face the book towards its wall, in both galleries of a pair", () => {
    for (const side of ["a", "b"] as const) {
      for (let wall = 1; wall <= 5; wall++) {
        const frame = deskFrame(2, side, wall);
        const center = new THREE.Vector3(...galleryCenter(side, 2));
        const towardsReader = bookToWorld(frame, new THREE.Vector3(0, 0, 1)).sub(frame.position).normalize();
        const outwards = frame.position.clone().sub(center).setY(0).normalize();
        expect(towardsReader.dot(outwards)).toBeGreaterThan(0.999);
        expect(frame.position.y).toBeCloseTo(2 * ROOM.level + 0.97, 6);
      }
    }
  });

  it("round-trips points between book space and the world", () => {
    const frame = deskFrame(-1, "b", 4);
    const p = new THREE.Vector3(0.3, 0.2, -0.7);
    near(worldToBook(frame, bookToWorld(frame, p)), p, 1e-9);
  });

  it("puts the reader's home view as far from the book as the reader does, scaled", () => {
    const shot = readerHomeShot(deskFrame(0, "a", 1));
    expect(shot.position.distanceTo(shot.target)).toBeCloseTo(HOME_POSITION.distanceTo(HOME_TARGET) * BOOK_SCALE, 9);
  });

  it("stands the visitor at the desk, facing the wall", () => {
    const pose = visitorAtDesk(0, "a", 3);
    expect(Math.hypot(pose.position.x, pose.position.z)).toBeCloseTo(1.9, 9);
    expect(pose.yaw).toBeCloseTo(sideYaw(2), 9);
  });
});

describe("close-up of a shelf", () => {
  it("matches the old shelf view camera in gallery A", () => {
    const { pose, yawRange } = closeupPose(0, "a", 2, 5);
    const bookY = shelfPlankY(5) + CASE.shelfThickness / 2 + CASE.bookH / 2;
    const eye = THREE.MathUtils.clamp(bookY, 1.05, 2.45);
    const expected = closeupForSide(1, 2.6);
    near(pose.position, new THREE.Vector3(expected[0], eye, expected[2]), 1e-9);
    expect(pose.yaw).toBeCloseTo(sideYaw(1), 9);
    expect(pose.pitch).toBeCloseTo(Math.atan2(bookY - eye, 2.6), 9);
    expect(yawRange[1] - yawRange[0]).toBeCloseTo(1.1, 9);
  });
});

describe("a closed book on its shelf", () => {
  it("fills the volume's box on the shelf", () => {
    const seed = hashString("babel");
    for (const [side, level, wall, shelf, volume] of [["a", 0, 3, 4, 18], ["b", 1, 5, 1, 1], ["a", -2, 1, 7, 32]] as const) {
      const pose = shelfBookPose(level, side, wall, shelf, volume, seed);
      const matrix = bookMatrix(pose);
      const placement = planBookcase(seed, wall).placements.find((b) => b.shelf === shelf && b.volume === volume)!;

      // Independent oracle: the same hierarchy HexGalleryScene builds.
      const gallery = new THREE.Object3D();
      gallery.position.set(...galleryCenter(side, level));
      gallery.rotation.y = galleryRotation(side);
      const a = sideAngle(wall - 1);
      const bookcase = new THREE.Object3D();
      bookcase.position.set(Math.cos(a) * (ROOM.apothem - 0.012), 0, Math.sin(a) * (ROOM.apothem - 0.012));
      bookcase.rotation.y = facingCenterRotation(a);
      const box = new THREE.Object3D();
      box.position.set(placement.x, placement.y, placement.z);
      box.scale.set(1, placement.scaleY, 1);
      gallery.add(bookcase);
      bookcase.add(box);
      gallery.updateMatrixWorld(true);

      const boxCorners: THREE.Vector3[] = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
        boxCorners.push(new THREE.Vector3((sx * CASE.bookW) / 2, (sy * CASE.bookH) / 2, (sz * CASE.bookD) / 2).applyMatrix4(box.matrixWorld));

      for (const x of [0, COVER.w / 2]) for (const y of [0, CLOSED_THICKNESS]) for (const z of [-COVER.d / 2, COVER.d / 2]) {
        const corner = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
        const nearest = Math.min(...boxCorners.map((c) => c.distanceTo(corner)));
        expect(nearest).toBeLessThan(0.005);
      }
    }
  });

  it("lies on the desk with the frame's own transform once the correction is gone", () => {
    const frame = deskFrame(0, "a", 2);
    const matrix = bookMatrix(deskBookPose(frame));
    const p = new THREE.Vector3(0.4, 0.05, -0.3);
    near(p.clone().applyMatrix4(matrix), bookToWorld(frame, p), 1e-9);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/explore/stage/deskFrame.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Create `bookcasePlan.ts`** by moving `CASE`, `BookRef`, `shelfPlankY`, `bookSpacing`, `bookLocalPosition` out of `Bookcase.tsx` and writing `planBookcase` from the existing `useMemo` loop (keep the exact call order of `rand()`; record `tint` in each placement). Re-export from `Bookcase.tsx`; move `TINT_GROUPS` and re-export from `materials.tsx`. `Bookcase` keeps working via `useMemo(() => planBookcase(seed, wall, detail?.shelf), [seed, wall, detail?.shelf])`.

- [ ] **Step 4: Create `bookSpace.ts`** by moving the constants and `blockHeights` out of `ReaderScene.tsx` verbatim (add the new ones listed above); `ReaderScene.tsx` imports them. Create `poses.ts`.

- [ ] **Step 5: Create `deskFrame.ts`** with the functions listed in Interfaces, following spec 3.1–3.3. `deskCenterLocal(wall)` = `u · (RAIL_APOTHEM + DESK.depth / 2)` at `y = DESK.top`; `deskCorners(wall)` = centre ± `u·depth/2` ± `t·width/2` with `t = (−u.z, 0, u.x)`; `deskLampLocal(wall)` = centre + `t·0.33` − `u·0.12` + `y 0.3`.

- [ ] **Step 6: Run the deskFrame tests; expect PASS. Run `npx vitest run src/components/explore/bookPages.test.ts` to confirm nothing moved broke.**

- [ ] **Step 7: Browser sanity check:** open `http://localhost:3000/explore/wall/3?hex=babel` and `http://localhost:3000/page/babel-3-4-18-200` in Chrome; the gallery and the reader look as before (bindings in the same colours, reader camera unchanged); no console errors.

- [ ] **Step 8: `npm run typecheck`, `npm run lint`, `npm test` pass.**

---

### Task 3: Route group, layout and the stage host (old scenes switched by view)

**Files:**
- Move: `src/app/[locale]/explore` → `src/app/[locale]/(library)/explore`; `src/app/[locale]/page` → `src/app/[locale]/(library)/page` (`git mv`)
- Modify: the four `loading.tsx` under `(library)` → `export default function Loading() { return null; }` with a one-line comment (the stage stays visible while a page loads)
- Create: `src/app/[locale]/(library)/layout.tsx`
- Create: `src/components/explore/stage/LibraryStageClient.tsx`, `LibraryStage.tsx`, `StageScene.tsx`
- Modify: `src/components/explore/SceneWrapper.tsx` (controlled `veil?: boolean`)
- Modify: the four `page.tsx` files

**Interfaces:**
- Consumes: Task 1 store/hooks; existing `HexGalleryScene` (modes walk/shelf), `VolumeScene`, `ReaderScene`, `Loupe`, `LibraryMaterialsProvider`, `hashString`.
- Produces: `(library)/layout.tsx` = server component rendering `<StageProvider><ExploreStage><LibraryStageClient />{children}</ExploreStage></StageProvider>`; `LibraryStageClient` ("use client", `dynamic(() => import("./LibraryStage"), { ssr: false })`); `LibraryStage` renders `<SceneWrapper seed={0} veil={…} onReady={() => store.patch({ ready: true })}><StageScene /></SceneWrapper>`; `StageScene` reads `view`, `desk`, `shelfTitles` with `useStageSelector` and renders the matching old scene. Stable callback wrappers (created once with `useMemo`) forward to `store.handlers.current.*` so memoised scenes never re-render for handler changes. `store.commands.lookAt` forwards to the walk controls handle.

Interim behaviour (replaced in Tasks 4–6): walk → `HexGalleryScene mode="walk"` keyed by the hex captured when the view kind became walk (the URL hex keeps changing while walking, the world must not remount); shelf → `<Suspense><LibraryMaterialsProvider seed={hashString(hex)}><HexGalleryScene mode="shelf" …/></…></Suspense>` keyed by hex/wall/shelf; desk index → same provider + `VolumeScene`; desk read → same provider + `ReaderScene` + `<Loupe active={desk.loupe} />`. `onPlace` → `store.patch({ place })` then the page handler; `onLockChange` → `store.patch({ locked })` then the handler.

- [ ] **Step 1:** Create the group folder and move the routes: `git -C C:/Users/user/Desktop/work/libraryofbabel mv "src/app/[locale]/explore" "src/app/[locale]/(library)/explore"` (create `src/app/[locale]/(library)` first with the Write tool by writing the layout file), then the same for `page`. Update `loading.tsx` files.
- [ ] **Step 2:** Add `veil?: boolean` to `SceneWrapper`: the veil shows while `!ready || veil === true`.
- [ ] **Step 3:** Write `layout.tsx`, `LibraryStageClient.tsx`, `LibraryStage.tsx`, `StageScene.tsx` per Interfaces. `StageScene` sets `window.__stage = { store }` in development.
- [ ] **Step 4:** Port the walk page: delete `SceneWrapper`/`HexGalleryScene` dynamic imports, `ExploreStage` wrappers and `controlsRef`; `useStageView({ kind: "walk", hex, wall: initialWall })` where `hex` is the URL `?hex=` (it follows the visitor through `replaceState`, which is why the stage keys the world by the hex it saw first, and why its `onPlace` wrapper patches `place` before calling the page handler); move today's callbacks into `useStageHandlers({ onHoverBook, onClickBook, onHoverShelf, onClickShelf, onFacingSide, onPlace, onInteract, onLockChange })`; `ready` and `locked` from `useStageSelector`; `selectWall` calls `store.commands.lookAt?.(sideYaw(w - 1), -0.04)`. Keep the "no hex → router.replace" branch (it publishes nothing).
- [ ] **Step 5:** Port the shelf page (publish view + `setShelfTitles` via `useStageStore().setShelfTitles` in an effect when titles change), the volume page (publish desk view mode "index" + desk inputs `{ title, spread: 0, contents: {}, query: "", loupe: false }`, handlers `onHoverIndexPage`/`onClickIndexPage` wired to today's `onHoverPage`/`onClickPage`), and the reader page (publish desk view mode "read" + all `ReaderScene` props as desk inputs + `loupe: loupe.active`; handlers `onHoverTurn`, `onTurn`, `onInteract`). HUDs unchanged otherwise. In `StageScene`, the index scene calls `handlers.onHoverIndexPage/onClickIndexPage`, the reader `onHoverTurn/onTurn/onInteract`.
- [ ] **Step 6:** `npm run typecheck`, `npm run lint`, `npm test`.
- [ ] **Step 7: Browser:** in Chrome open `http://localhost:3000/explore/wall/3?hex=babel`, run `evaluate_script` `() => { document.querySelector('canvas').dataset.probe = 'kept'; return true; }`; click through wall → shelf (click a plank) → volume (click a volume) → page (click an index number) → browser back ×3 (`navigate_page` with `type: "back"`); after each step check `document.querySelector('canvas')?.dataset.probe === 'kept'` (the canvas survived), the scene shows the right view, the HUD is correct, and `list_console_messages` has no errors. Also open `/en/page/babel-3-4-18-200?q=a` directly: the reader shows the English HUD and highlights.

---

### Task 4: Persistent world, shelf close-up inside it, controls activation, director skeleton

**Files:**
- Modify: `src/components/explore/GalleryControls.tsx`
- Modify: `src/components/explore/HexGalleryScene.tsx` (remove `ShelfView`, `mode`; extend `GalleryWorld`; constant shelf spot in `LightPool`)
- Create: `src/components/explore/stage/Director.tsx`
- Modify: `src/components/explore/stage/StageScene.tsx`

**Interfaces:**
- Consumes: `decideTransition`, store; `closeupPose`, `visitorAtDesk`, `walkShot`, `galleryToWorld`, `galleryYaw` (Task 2); `planBookcase`.
- Produces:
  - `GalleryControlsHandle` gains `setActive(active: boolean): void`, `configure(o: { walk: boolean; capture: boolean; yawRange?: [number, number]; pitchRange: [number, number]; fovRange: [number, number] }): void`, `getPose(): { position: THREE.Vector3; yaw: number; pitch: number; fov: number }`, and `teleport` also accepts an optional `fov`. Inactive: listeners return early (still track `pointerlockchange`), the frame loop does not touch the camera, capture/free mode released and keys cleared. `walk`/`capture`/ranges used inside listeners and the frame loop come from refs set by props and by `configure`.
  - `GalleryWorld` props: `worldHex: string; initialPose: WalkPose; controlsRef; interactive: "walk" | "shelf" | "none"; detail: { wall: number; shelf: number; titles: string[] } | null` (applies to the current gallery cell only, gives that bookcase `detail` and `focusShelf`); `hidden: { level: number; side: GallerySide; wall: number; shelf: number; volume: number } | null` (Bookcase support comes in Task 5; accept and pass it through now); `shelfSpot: { wall: number; shelf: number } | null`; `onCurrentCellReady?: () => void`; the existing callbacks. Walking (`onFrame` level/side tracking) only while `interactive === "walk"`.
  - `Director` (inside the canvas): holds `controller: Controller | null`, `worldHex`, `visitorPose: WalkPose`; subscribes to `view`; on each view change runs `decideTransition(controller, place?.hex ?? null, view)` and applies it **instantly** for `build`, `rebuild`, `glide`, `none`; desk kinds stay with the interim desk scenes from Task 3 for now (the world is not rendered while the view is desk). `rebuild` shows the veil (`store.patch({ ready: false })` + `SceneWrapper veil`) until `onCurrentCellReady` or 1.5 s. Registers `store.commands.lookAt`. Entering shelf: save `visitorPose` from `getPose()` if leaving walk; `configure({ walk: false, capture: false, yawRange, pitchRange: [-0.45, 0.45], fovRange: [26, 62] })`, `teleport(closeup.pose, fov 50)`, `detail` from `shelfTitles` matching the view (or 32 empty titles), `shelfSpot` on. Entering walk: `configure({ walk: true, capture: true, pitchRange: [-1.1, 1.1], fovRange: [34, 72] })`, `teleport(visitorPose, fov 58)`. Build into shelf: `visitorPose = visitorAtDesk(...)`; build into walk: `viewpointForSide(wall-1)` facing the wall, as today.

- [ ] **Step 1:** Implement the `GalleryControls` handle additions with refs; keep the effect deps unchanged; add a doc comment on `setActive`/`configure`.
- [ ] **Step 2:** Refactor `HexGalleryScene.tsx`: delete `ShelfView` and the `mode` prop (export `GalleryWorld` as default instead of `HexGalleryScene`, keep `WorldPlace` export); `GalleryWorld` receives the props above; `GalleryCell` passes `detail`/`focusShelf` for the current cell's matching wall and `lampLight`/`interactive` flags as today; add to `LightPool` a permanent `spotLight` + target (values of today's `ShelfSpot`, intensity 0 when `shelfSpot` is null) positioned for the current gallery; `onCurrentCellReady` fires once when the current cell's Suspense content mounts (a tiny `useEffect` child inside the cell's provider).
- [ ] **Step 3:** Write `Director.tsx` and update `StageScene.tsx`: walk/shelf views render the persistent `GalleryWorld` (key = `worldHex`) controlled by the director; desk views keep the Task 3 interim scenes.
- [ ] **Step 4:** `npm run typecheck`, `npm run lint`, `npm test`.
- [ ] **Step 5: Browser:** at `/explore/wall/3?hex=babel` walk a few steps (hold W via `evaluate_script` dispatching `keydown`/`keyup` on `window` with `code: "KeyW"` 800 ms apart), record `window.__gallery`-style pose via `__stage` (expose `__stage.director = { controller, visitorPose }`), click a shelf plank (the page pushes the shelf route) → the camera is at the close-up, titles fade in within ~2 s, the canvas probe survived; browser back → the camera is exactly at the saved pose (compare within 1 cm), walking works, mouse capture still works (click → lock hint changes). Record `renderer.info.programs.length` (`__stage.gl = gl`) before and after: equal. Direct `/explore/wall/2/shelf/5?hex=babel` shows the close-up; back link → walk standing at the desk position facing wall 2. Changing the hex in the URL (`/explore/wall/3?hex=other`) rebuilds with the veil.

---

### Task 5: Reading desks, the desk light and the gap on the shelf

**Files:**
- Create: `src/components/explore/stage/ReadingDesk.tsx`
- Modify: `src/components/explore/HexGalleryScene.tsx` (`GalleryRoom` renders five desks; `LightPool` gains the desk light)
- Modify: `src/components/explore/Bookcase.tsx` (`hidden` prop)
- Modify: `src/components/explore/stage/Director.tsx` (dev hook `__stage.hide(wall, shelf, volume)` / `__stage.lightDesk(wall | null)` for checking this task)

**Interfaces:**
- Consumes: `DESK`, `deskCenterLocal`, `deskLampLocal`, `galleryToWorld`, `galleryYaw` (Task 2).
- Produces: `ReadingDesk({ wall: number; lit: boolean })` in gallery-local space (board, brackets, lamp; globe material `materials.lamp` when lit, otherwise a shared dim `MeshStandardMaterial` created once at module level); `GalleryWorld` prop `deskLamp: { wall: number; intensity: number } | null` — `LightPool` owns one permanent `pointLight` (`LAMP_COLOR`, distance 3, decay 2) placed at the lamp of that wall in the current gallery (intensity 0 when null; tune the lit value by eye, start at 0.6); `Bookcase` prop `hidden?: { shelf: number; volume: number }` — that instance is written with zero scale in every `writeInstance` path (initial layout, hover, clear) and no `DetailedBook` is rendered for it; `GalleryWorld.hidden` is passed to the bookcase of `hidden.wall` in the cell at `hidden.level`/`hidden.side`.

- [ ] **Step 1:** `ReadingDesk.tsx`: board `boxGeometry [DESK.width, DESK.board, DESK.depth]` whose top is at `DESK.top`, oriented so its depth runs along `u` (rotation.y = `Math.atan2(u.x, u.z)`), two iron brackets (thin boxes from the board underside down to `ROOM.railHeight * 0.55`), lamp (base cylinder r 0.04 h 0.02, stem r 0.006 h 0.26, globe sphere r 0.035) at `deskLampLocal(wall)`.
- [ ] **Step 2:** Render `<ReadingDesk wall={w} lit={…} />` for walls 1..5 inside `GalleryRoom` (not in `DistantLevel`), `lit` only for the current cell's active desk.
- [ ] **Step 3:** Desk light in `LightPool`; `Bookcase.hidden`.
- [ ] **Step 4:** `npm run typecheck`, `npm run lint`, `npm test` (the walking constraint tests in `deskFrame.test.ts` already guarantee desks stay out of the walkable ring).
- [ ] **Step 5: Browser:** screenshot the desks from the gallery view (`/explore/wall/3?hex=babel`, teleport via `__stage` to position (2.75, 1.6, −1.59) yaw 2.094 pitch 0.02 — use the controls handle `teleport`); walk along the ring past two desks (no snagging, no clipping through the camera); `__stage.hide(3, 4, 18)` leaves a visible gap; `__stage.lightDesk(3)` lights the lamp; `renderer.info.programs.length` unchanged by lighting/hiding.

---

### Task 6: The desk book at real scale, and instant take/return/mode/swap

**Files:**
- Create: `src/components/explore/stage/DeskBook.tsx` (from `ReaderScene.tsx` + the index part of `VolumeScene.tsx`)
- Delete: `src/components/explore/ReaderScene.tsx`, `src/components/explore/VolumeScene.tsx` (move `Bookmark` and `useTitlePageText` into `DeskBook.tsx` or a sibling `bookParts.tsx`)
- Modify: `src/components/explore/stage/Director.tsx`, `StageScene.tsx`
- Modify: the volume page (HUD back from `origin`) and the reader page if needed

**Interfaces:**
- Consumes: `bookSpace.ts`, `deskFrame.ts` (`deskFrame`, `bookToWorld`, `worldToBook`, `bookDirToWorld`, `readerHomeShot`, `deskBookPose`, `bookMatrix`, `BOOK_SCALE`, `visitorAtDesk`), store handlers, `Loupe`.
- Produces: `DeskBook` props `{ book: BookAddress; frame: DeskFrame; mode: "index" | "read"; inputs: DeskInputs; controlsEnabled: boolean; interactive: boolean; pose?: BookPose; openness?: number }` (`pose`/`openness` unused until Task 8: the group matrix is `bookMatrix(pose ?? deskBookPose(frame))` with `matrixAutoUpdate = false`). Camera logic per spec 3.6: OrbitControls target/limits in world units, `VIEW_BOUNDS` clamp and home drift in book space, `glideToSpot`/`glideHome` via `bookToWorld`. Index mode per spec 4 (right page of spread 0 = `makeIndexPage`; highlight quad and `indexCellFromUv` on the right page mesh; `onHoverIndexPage(page | null)`, `onClickIndexPage(page)`; clicks only when settled at spread 0). Read mode = today's reader. `window.__reader` kept.
- Director additions (instant for now): `take` → `hidden` = the book on its shelf in the current cell, `deskLamp` on for the book's wall, `origin` patched, save `visitorPose` if leaving walk, deactivate `GalleryControls`, camera to `readerHomeShot(frame)` with `near = READER_NEAR * BOOK_SCALE`, `DeskBook` with `controlsEnabled`; `return` → clear `hidden`/`deskLamp`, near back to `WALK_NEAR`, then enter walk or shelf as in Task 4; `mode` → pass the new mode; `swap` → replace the book (key changes) and `hidden`. Build/rebuild into desk: world at `book.hex`, `visitorPose = visitorAtDesk(0, "a", book.wall)`, origin `{ kind: "walk" }`, desk state directly. Click-started takes: the `onClickBook` wrapper (walk and shelf states only, not while `moving`) starts the take immediately and calls the page handler; if no desk view for that book arrives within 3 s, return to the current view. Release mouse capture at the start of a take. `<Loupe active={desk.loupe && controller is desk read} />` in `StageScene`. The world now stays rendered in every state; the interim desk scenes from Task 3 are deleted.
- Volume page: HUD back = `origin.kind === "shelf"` → `/explore/wall/${origin.wall}/shelf/${origin.shelf}?hex=` label `backShelf`; otherwise → `/explore/wall/${wall}?hex=` label `backWall`.

- [ ] **Step 1:** Create `DeskBook.tsx` by moving `ReaderScene.tsx`'s code; replace `CameraRig` (the director sets the camera) and convert every camera/controls read and write to the frame as described; add index mode from `VolumeScene`; give every mesh of the book a parent `<group matrixAutoUpdate={false}>` whose matrix is set each frame.
- [ ] **Step 2:** Update `Director.tsx` and `StageScene.tsx` per Interfaces; delete the old scene files and fix imports.
- [ ] **Step 3:** Volume page HUD back.
- [ ] **Step 4:** `npm run typecheck`, `npm run lint`, `npm test`.
- [ ] **Step 5: Browser (Chrome, front):** from `/explore/wall/3?hex=babel` click a volume (use the controls handle to aim, then `click` at the canvas centre in free-mouse or drag mode) → the book lies open on the desk across from wall 3 inside the gallery, index visible, the shelf gap visible when you orbit, the lamp lit, canvas probe kept; hover an index number → tooltip; click → the reader at that spread on the same desk; type a phrase in the find bar → the camera glides to the match (target lies on the page: check `__reader.controls.current.target` is within the book bounds in book space); open the loupe (L) → it magnifies the page; open "text and address" panel → works; ← back → index; ← back → walk at the saved pose with the gap filled; browser back/forward repeat the same; direct `/page/babel-3-4-18-200` → book on the desk, back to index → back to walk standing at the desk; `renderer.info.programs.length` identical in walk and at the desk; no console errors. Check for z-fighting of distant shelves while at the desk (screenshot); if visible, raise the desk near plane to 0.006 and set `MIN_DISTANCE * BOOK_SCALE` accordingly.

---

### Task 7: Timelines (pure)

**Files:**
- Create: `src/components/explore/stage/timeline.ts`, `src/components/explore/stage/timeline.test.ts`

**Interfaces:**
- Consumes: `CameraShot`, `BookPose` from `poses.ts` (Task 2).
- Produces: spec 5.2 verbatim (`StageFrame`, `Timeline`, `takeTimeline`, `returnTimeline`, `glideTimeline`, `reversed`, `scaled`, `DURATION`), plus `sampleInto` behaviour: `sample(t, out?)` clamps `t` to `[0, duration]`, fills and returns `out` when given (no allocation in the frame loop).

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/explore/stage/timeline.test.ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { BookPose, CameraShot } from "./poses";
import { DURATION, glideTimeline, returnTimeline, reversed, scaled, takeTimeline, type StageFrame } from "./timeline";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const shot = (p: THREE.Vector3, t: THREE.Vector3, fov: number, near: number): CameraShot => ({ position: p, target: t, fov, near });
const pose = (p: THREE.Vector3, yaw: number, s = v(1, 1, 1)): BookPose => ({ position: p, quaternion: new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), yaw), scale: s });

const eye = shot(v(0, 1.6, 2.2), v(0, 1.6, 3.2), 58, 0.05);
const home = shot(v(0.05, 1.33, 1.6), v(0, 1.02, 1.3), 44, 0.003);
const onShelf = pose(v(0.1, 1.2, 3.0), 0.3, v(1.06, 2.84, 1.0));
const onDesk = pose(v(0, 1.0, 1.3), 1.2);
const input = { cameraFrom: eye, bookFrom: onShelf, bookTo: onDesk, shelfNormal: v(0, 0, -1), cameraTo: home, seed: 7 };

const close = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-6) => expect(a.distanceTo(b)).toBeLessThan(eps);
const sameFrame = (a: StageFrame, b: StageFrame) => {
  close(a.camera.position, b.camera.position);
  close(a.camera.target, b.camera.target);
  expect(a.camera.fov).toBeCloseTo(b.camera.fov, 6);
  expect(a.camera.near).toBeCloseTo(b.camera.near, 9);
  close(a.book!.position, b.book!.position);
  expect(a.book!.quaternion.angleTo(b.book!.quaternion)).toBeLessThan(1e-6);
  close(a.book!.scale, b.book!.scale);
  expect(a.openness).toBeCloseTo(b.openness, 6);
};

function expectContinuous(tl: ReturnType<typeof takeTimeline>) {
  let prev = tl.sample(0);
  for (let t = 1 / 120; t <= tl.duration + 1e-9; t += 1 / 120) {
    const cur = tl.sample(t);
    expect(cur.camera.position.distanceTo(prev.camera.position)).toBeLessThan(0.06);
    expect(cur.book!.position.distanceTo(prev.book!.position)).toBeLessThan(0.06);
    expect(cur.book!.quaternion.angleTo(prev.book!.quaternion)).toBeLessThan(0.08);
    expect(Math.abs(cur.openness - prev.openness)).toBeLessThan(0.05);
    prev = cur;
  }
}

describe("takeTimeline", () => {
  const tl = takeTimeline(input);

  it("lasts as long as a take", () => expect(tl.duration).toBeCloseTo(DURATION.take, 9));

  it("starts at the eye with the book closed on its shelf", () => {
    const f = tl.sample(0);
    close(f.camera.position, eye.position);
    close(f.camera.target, eye.target);
    close(f.book!.position, onShelf.position);
    close(f.book!.scale, onShelf.scale);
    expect(f.openness).toBe(0);
    expect(f.deskLight).toBe(0);
  });

  it("ends open on the desk at the reader's home view", () => {
    const f = tl.sample(tl.duration);
    close(f.camera.position, home.position);
    close(f.camera.target, home.target);
    expect(f.camera.fov).toBeCloseTo(44, 9);
    expect(f.camera.near).toBeCloseTo(0.003, 12);
    close(f.book!.position, onDesk.position);
    expect(f.book!.quaternion.angleTo(onDesk.quaternion)).toBeLessThan(1e-6);
    close(f.book!.scale, v(1, 1, 1));
    expect(f.openness).toBe(1);
    expect(f.deskLight).toBe(1);
  });

  it("moves without jumps", () => expectContinuous(tl));

  it("clamps time and fills the frame it is given", () => {
    const out = tl.sample(0);
    expect(tl.sample(99, out)).toBe(out);
    sameFrame(out, tl.sample(tl.duration));
  });
});

describe("returnTimeline", () => {
  const tl = returnTimeline({ cameraFrom: home, bookFrom: onDesk, bookTo: onShelf, shelfNormal: v(0, 0, -1), cameraTo: eye, seed: 7 });

  it("closes the book first and ends on the shelf at the eye", () => {
    expect(tl.duration).toBeCloseTo(DURATION.return, 9);
    expect(tl.sample(0).openness).toBe(1);
    const end = tl.sample(tl.duration);
    close(end.book!.position, onShelf.position);
    close(end.book!.scale, onShelf.scale);
    close(end.camera.position, eye.position);
    expect(end.openness).toBe(0);
    expect(end.deskLight).toBe(0);
  });

  it("moves without jumps", () => expectContinuous(tl));
});

describe("reversed and scaled", () => {
  const tl = takeTimeline(input);

  it("plays backwards from a moment", () => {
    const back = reversed(tl, 0.8);
    expect(back.duration).toBeCloseTo(0.8, 9);
    sameFrame(back.sample(0.3), tl.sample(0.5));
    sameFrame(back.sample(0.8), tl.sample(0));
  });

  it("stretches time", () => {
    const fast = scaled(tl, 0.35);
    expect(fast.duration).toBeCloseTo(tl.duration * 0.35, 9);
    sameFrame(fast.sample(0.35), tl.sample(1.0));
  });
});

describe("glideTimeline", () => {
  it("goes from one shot to another and has no book", () => {
    const tl = glideTimeline(eye, home);
    expect(tl.duration).toBeCloseTo(DURATION.glide, 9);
    expect(tl.sample(0.3).book).toBeNull();
    close(tl.sample(tl.duration).camera.position, home.position);
    close(tl.sample(0).camera.target, eye.target);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/explore/stage/timeline.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `timeline.ts`** per spec 5.2 phase tables. Use local helpers `clamp01`, `phase(t, a, b)`, `easeInOutCubic`, `easeOutCubic`, `smoothstep`, `bezier3(p0, p1, p2, p3, u, out)`; quaternions via `THREE.Quaternion.slerpQuaternions` (plus a seeded roll `sin(πu)·0.35·(trait − 0.5)` about the flight direction that is 0 at both ends); scale via `lerpVectors`; the camera target during a take starts at `cameraFrom.target`, blends into the flying book's position over camera phase `u ∈ [0, 0.25]` (smoothstep) and from there into `cameraTo.target` over `u ∈ [0.6, 1]` (smoothstep), so it is continuous and exact at both ends; a return does the mirror (from `cameraFrom.target` to the book, then to `cameraTo.target`); fov/near eased (near interpolated geometrically: `near = from·(to/from)^u`). Pre-allocate scratch vectors per timeline; `sample(t, out)` writes into `out` (allocate a frame when omitted). Exact endpoints: evaluate phases with `clamp01` so `u` is exactly 0 or 1 at the ends.
- [ ] **Step 4: Run the tests; PASS. `npm run typecheck`, `npm run lint`, `npm test`.**

---

### Task 8: Flights — hinged covers, the director playing timelines, skip, reverse, swap

**Files:**
- Modify: `src/components/explore/stage/DeskBook.tsx` (hinged covers, `pose`, `openness`)
- Modify: `src/components/explore/stage/Director.tsx`, `StageScene.tsx`
- Modify: walk page (hide reticle/tooltip while `moving`), volume and reader pages (hint appears once `moving` is false), `src/components/explore/ExploreHud.tsx` only if a prop is needed

**Interfaces:**
- Consumes: Task 7 timelines; `shelfBookPose`, `deskBookPose`, `bookMatrix`, `walkShot`, `readerHomeShot`, `closeupPose` (Task 2); store `patch({ moving })`, `commands.skip`.
- Produces: `DeskBook` honours `openness` (spec 4: front half = left cover half + left block + left page + bookmark rotating about z through `(0, COVER_TOP + (hl + hr) / 2)` by `−π·(1 − openness)`, spine by half; sheets hidden while `openness < 1`; OrbitControls and pointer handlers disabled while not at rest) and `pose` (group matrix `bookMatrix(pose)`). Director plays: take (`takeTimeline` from `walkShot(current pose)` or the close-up shot, `shelfBookPose`, `deskBookPose(frame)`, shelf normal = world direction from the wall into the room), return (`returnTimeline` from the current camera — position, OrbitControls target, fov, near — to `walkShot(visitorPose)` or the close-up shot), glide (`glideTimeline`), swap (return of A then take of B with the camera shot held at `readerHomeShot`, both `scaled(…, 1 / 1.5)`, gap `DURATION.swapGap`; two `DeskBook`s mounted meanwhile), mode changes stay instant (Task 9 animates pages). Frame loop: `t += dt × timeScale`; sample into a reused frame; write camera (`position`, `lookAt(target)`, `fov`, `near`, `updateProjectionMatrix`), book pose/openness, desk light intensity × lit value; hand over controllers at the end (Tasks 4 and 6 rules). Reduced motion: `window.matchMedia("(prefers-reduced-motion: reduce)").matches` → `scaled(tl, DURATION.reducedMotion)`. Skip: while moving, `pointerdown` on the canvas or `keydown` Space/Enter/Escape (check `e.key` and `e.code`) jumps to the end and stops the event; `store.commands.skip` does the same. Retarget: a new view equal to the transition's origin → `reversed(current, t)` (swap the end controller accordingly); any other view → finish instantly, then start the new transition. `store.patch({ moving: true/false })`. World clicks, book hover and index/turn clicks ignored while moving. Dev hook: `__stage.setTimeScale(x)`, `__stage.skip()`, `__stage.state()` → `{ controller, moving, t, duration }`.

- [ ] **Step 1:** Hinged covers and `pose` in `DeskBook` (split the cover board into two halves `COVER.w / 2` wide around the spine).
- [ ] **Step 2:** Director timelines, skip, retarget/reverse, reduced motion, swap, moving flag, dev hook.
- [ ] **Step 3:** Pages: while `moving`, the walk page shows no reticle/tooltip; volume and reader hints start their timers when `moving` becomes false.
- [ ] **Step 4:** `npm run typecheck`, `npm run lint`, `npm test`.
- [ ] **Step 5: Browser (Chrome in front):** for each of take (walk), take (shelf), return (walk), return (shelf), glide walk→shelf, swap (reader: go to page 410 of volume 18 via `/page/babel-3-4-18-410`, press → past the cover): `__stage.setTimeScale(0)` right after triggering, then step `t` by calling `__stage.seek(fraction)` (add it to the dev hook: sets `t = fraction × duration` and renders) at 0.15, 0.5, 0.8 and screenshot — the book is visibly between shelf and desk and the camera tracks it; at 1.0 the desk view equals the Task 6 end state. With time scale 1: a take completes in ~2 s (measure with `performance.now()` around `moving` flips), a click mid-flight skips to the end, browser back mid-take reverses from the current point, `emulate` with reduced motion (or override `matchMedia` in `evaluate_script`) makes it ~0.7 s. `renderer.info.programs.length` unchanged across all of it; no console errors.

---

### Task 9: Page bunches between the index and a page

**Files:**
- Modify: `src/components/explore/stage/DeskBook.tsx`
- Modify: `src/components/explore/leaves.ts` (export a fast parameter set)
- Create: `src/components/explore/leaves.test.ts`

**Interfaces:**
- Consumes: `createLeaves`, `stepLeaves`, `settledAt`, `TURN` (`leaves.ts`).
- Produces: `export const TURN_RIFFLE: TurnParams` (same fields as `TURN`, faster); `DeskBook` uses `TURN_RIFFLE` while `|target − arranged.left| > 12`, `TURN` otherwise; index ↔ read transitions set the target spread (the director no longer snaps leaves); page 1's front texture is the index while the book is in index mode or a leaf that left spread 0 from index mode is still in the air (spec 5.4); index clicks only when settled at spread 0.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/explore/leaves.test.ts
import { describe, expect, it } from "vitest";
import { LIBRARY } from "@/lib/library";
import { TURN, TURN_RIFFLE, createLeaves, settledAt, stepLeaves } from "./leaves";

const LEAVES = Math.floor(LIBRARY.pages / 2);

function secondsToSettle(from: number, to: number, params: typeof TURN): number {
  const leaves = createLeaves(LEAVES, from);
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let frame = 1; frame <= 60 * 20; frame++) {
    stepLeaves(leaves, to, 1 / 60, params, random);
    if (settledAt(leaves, to)) return frame / 60;
  }
  return Infinity;
}

describe("riffling through a volume", () => {
  it("reaches any spread from the index within a second and a half", () => {
    for (const to of [13, 60, 120, LEAVES]) expect(secondsToSettle(0, to, TURN_RIFFLE)).toBeLessThanOrEqual(1.5);
  });

  it("comes back to the index as quickly", () => {
    expect(secondsToSettle(LEAVES, 0, TURN_RIFFLE)).toBeLessThanOrEqual(1.5);
  });

  it("is faster than ordinary turning for long jumps", () => {
    expect(secondsToSettle(0, 120, TURN_RIFFLE)).toBeLessThan(secondsToSettle(0, 120, TURN));
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/explore/leaves.test.ts` — FAIL (`TURN_RIFFLE` missing).
- [ ] **Step 3:** Add `TURN_RIFFLE` (start from `TURN` and raise speed, acceleration, the bunch threshold and the number of sheets in the air until the test passes without making short flips jerky — the ordinary `TURN` stays unchanged); wire `DeskBook` as described.
- [ ] **Step 4:** Tests PASS; `npm run typecheck`, `npm run lint`, `npm test`.
- [ ] **Step 5: Browser:** index → page 300: pages fly as a bunch and land at spread 150 in ≤ 1.5 s, the leaf leaving spread 0 shows the index on its front; ← back to index: bunch returns, index visible on landing; ordinary ←/→ flips look as before.

---

### Task 10: Hints, translations, READMEs, final pass

**Files:**
- Modify: `messages/ru.json`, `messages/en.json` (Gallery `hintDesktop`/`hintTouch`: clicking a volume carries it to the reading desk; Volume `hint`/`hintDesktop`: the book lies on the desk at the railing, a click or Space skips a flight; Reader `hintDesktop` unchanged except mention of Esc/Space skipping flights if it reads naturally)
- Modify: `README.md` (Russian), `README.en.md` (English): describe the desks, flights, back navigation and the dev hook `window.__stage`; keep existing clips; no new media.

- [ ] **Step 1:** Update both message files with matching keys (no key removed that is still used; remove `lampsWarming` only if unused — it is still used by the veil).
- [ ] **Step 2:** Update both READMEs in the same structure as today's sections.
- [ ] **Step 3:** `npm run typecheck`, `npm run lint`, `npm test`.
- [ ] **Step 4: Final browser pass in both languages** (`/explore/wall/3?hex=babel` and `/en/explore/wall/3?hex=babel`): the whole scenario list of spec section 8; collect console errors (must be none) and screenshots of: gallery with desks, mid-take, book open on the desk with the gallery around, reader close-up, shelf close-up. Save screenshots to the session scratchpad (not into `docs/`).
