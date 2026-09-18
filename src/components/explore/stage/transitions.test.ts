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
