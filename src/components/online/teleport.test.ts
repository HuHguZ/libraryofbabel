// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addressOf } from "@/lib/world";
import { noteHref, placeHref, sharedPlaceHref, viewHref } from "./teleport";
import { viewOf } from "./presence";

const cell = { x: -3n, floor: 7n };
const hex = addressOf(cell);

it("shares the first readable spread as page one, reserving page zero for the index", () => {
  const view = viewOf({ kind: "desk", book: { hex, wall: 1, shelf: 2, volume: 3 }, mode: "read" }, 0, 0);
  expect(sharedPlaceHref({ cell: "-3:7", view })).toBe(`/page/${hex}-1-2-3-1`);
});

it("opens note and shared fragments on their own page", () => {
  const base = { id: 1, cell: "-3:7", text: "x", author: "a", nick: "a", color: "#b02e3a", at: "" };
  expect(noteHref({ ...base, anchor: null })).toBe(`/explore/wall/1?hex=${hex}`);
  expect(noteHref({ ...base, anchor: { wall: 2, shelf: 3, volume: 4, page: 5, start: 6, end: 7 } })).toBe(`/page/${hex}-2-3-4-5?note=1`);
  expect(sharedPlaceHref({ cell: "-3:7", view: { kind: "desk", wall: 2, shelf: 3, volume: 4, page: 4 }, fragment: { page: 5, start: 6, end: 7 }, note: 1 })).toBe(`/page/${hex}-2-3-4-5?note=1`);
  expect(sharedPlaceHref({ cell: "-3:7", view: { kind: "desk", wall: 2, shelf: 3, volume: 4, page: 4 }, fragment: { page: 5, start: 6, end: 7 } })).toBe(`/page/${hex}-2-3-4-5?text=5:6-7`);
});

describe("teleport links", () => {
  it("lead to a gallery facing a wall (a doorway or nonsense means wall 1)", () => {
    expect(placeHref(cell, 3)).toBe(`/explore/wall/3?hex=${hex}`);
    expect(placeHref(cell, 0)).toBe(`/explore/wall/1?hex=${hex}`);
    expect(placeHref(cell)).toBe(`/explore/wall/1?hex=${hex}`);
  });

  it("lead to what someone is doing there", () => {
    expect(viewHref(cell, { kind: "walk", wall: 2 })).toBe(`/explore/wall/2?hex=${hex}`);
    expect(viewHref(cell, { kind: "shelf", wall: 4, shelf: 6 })).toBe(`/explore/wall/4/shelf/6?hex=${hex}`);
    expect(viewHref(cell, { kind: "desk", wall: 1, shelf: 2, volume: 3, page: 40 })).toBe(`/page/${hex}-1-2-3-40`);
    expect(viewHref(cell, { kind: "desk", wall: 1, shelf: 2, volume: 3, page: 0 })).toBe(`/explore/wall/1/shelf/2/volume/3?hex=${hex}`);
  });
});
