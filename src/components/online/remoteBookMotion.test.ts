import { expect, it } from "vitest";
import { cellOf, cellKey } from "@/lib/world";
import { visitorAtDesk } from "@/components/explore/stage/deskFrame";
import { nearbyReaders, type ReaderLayout } from "./remoteReading";
import { stepRemoteBooks, type RemoteVolume } from "./remoteBookMotion";
const cell = cellOf("babel"), place = { cell, col: 0, level: 0 };
function reader(id = "a", volume = 1, desk = 1): ReaderLayout {
  const pose = visitorAtDesk(0, 0, desk);
  return nearbyReaders([{ id, nick: id, color: "#b02e3a", cell: cellKey(cell), p: pose.position.toArray(), yaw: pose.yaw, view: { kind: "desk", wall: 1, shelf: 1, volume, page: 4 } }], new Map(), place)[0];
}
it("starts an existing reader on the desk, reuses the book for page turns and bounds live instances", () => {
  const books = new Map<string, RemoteVolume>(), pending = new Set<string>(), first = reader();
  stepRemoteBooks(books, [first], null, 0, pending);
  const book = books.get("a")!;
  expect(book.motion).toEqual({ pose: null, openness: 1 });
  stepRemoteBooks(books, [{ ...first, view: { ...first.view, kind: "desk", wall: 1, shelf: 1, volume: 1, page: 20 } }], null, 0.1, pending);
  expect(books.get("a")).toBe(book); expect(book.page).toBe(20);
  stepRemoteBooks(books, Array.from({ length: 30 }, (_, n) => reader(String(n))), null, 0.1, pending);
  expect(books.size).toBeLessThanOrEqual(8);
});
it("reverses a cancelled take and flies the latest book in, then releases departed readers", () => {
  const books = new Map<string, RemoteVolume>(), pending = new Set<string>(), first = { ...reader(), arrive: true };
  stepRemoteBooks(books, [first], null, 0.3, pending);
  for (let n = 0; n < 6; n++) stepRemoteBooks(books, [first], null, 0.05, pending);
  const old = books.get("a")!;
  expect(old.motion.pose).not.toBeNull();
  const next = reader("a", 2);
  for (let n = 0; n < 60; n++) stepRemoteBooks(books, [next], null, 0.05, pending);
  expect(books.get("a")!.book.volume).toBe(2);
  expect(books.get("a")!.motion.pose).toBeNull();
  for (let n = 0; n < 45; n++) stepRemoteBooks(books, [], null, 0.05, pending);
  expect(books.size).toBe(0);
});
it("forgets queued arrivals that leave while the eight book slots are occupied", () => {
  const books = new Map<string, RemoteVolume>(), pending = new Set<string>();
  const full = Array.from({ length: 8 }, (_, n) => reader(`reader-${n}`, 1, Math.floor(n / 2) + 1));
  stepRemoteBooks(books, full, null, 0, pending);
  expect(books.size).toBe(8);
  const queued = { ...reader("queued"), col: 1, cell: { x: cell.x + 1n, floor: cell.floor }, arrive: true };
  stepRemoteBooks(books, [...full, queued], null, 0.1, pending);
  expect(pending.has("queued")).toBe(true);
  stepRemoteBooks(books, full, null, 0.1, pending);
  expect(pending.has("queued")).toBe(false);
});
it("counts returning volumes towards the two-book desk limit", () => {
  const books = new Map<string, RemoteVolume>(), pending = new Set<string>();
  stepRemoteBooks(books, [reader("a"), reader("b")], null, 0, pending);
  stepRemoteBooks(books, [reader("c"), reader("d")], null, 0.05, pending);
  expect(books.size).toBe(2);
  expect(books.has("c")).toBe(false);
  for (let n = 0; n < 40; n++) stepRemoteBooks(books, [reader("c"), reader("d")], null, 0.05, pending);
  expect([...books.keys()]).toEqual(["c", "d"]);
});
