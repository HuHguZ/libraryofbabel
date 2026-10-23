// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addressOf, cellOf, offsetCell } from "@/lib/world";
import { worldAddresses } from "./worldAddresses";

describe("worldAddresses", () => {
  it("names the world's own gallery by its address, however short", () => {
    const world = worldAddresses("babel");
    expect(world.hexAt(0, 0)).toBe("babel");
    expect(world.anchor).toEqual(cellOf("babel"));
  });

  it("finds the address of any gallery around the anchor, and the same one every time", () => {
    const world = worldAddresses("babel");
    const hex = world.hexAt(2, -3);
    expect(hex).toBe(addressOf(offsetCell(cellOf("babel"), 2, -3)));
    expect(world.hexAt(2, -3)).toBe(hex);
    expect(cellOf(hex)).toEqual(offsetCell(world.anchor, 2, -3));
  });
});
