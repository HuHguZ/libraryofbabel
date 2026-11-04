// @vitest-environment node
import { expect, it } from "vitest";
import { World } from "./world";

it("includes ephemeral reading data in moves and clears it with a legacy pose", () => {
  const world = new World();
  const pose = { cell: "0:0", p: [0, 1.6, 0] as [number, number, number], yaw: 0, view: { kind: "desk" as const, wall: 1, shelf: 2, volume: 3, page: 4 } };
  const reading = { fragment: { page: 4, start: 2, end: 8, color: "#abcdef" }, loupe: { page: 4, u: 0.2, v: 0.3, power: 3 } };
  world.join({ ...pose, id: "reader", nick: "Reader", color: "#abcdef", reading });
  expect(world.takeMoves()).toMatchObject({ type: "poses", list: [{ id: "reader", reading }] });
  world.move("reader", pose);
  expect(world.players.get("reader")?.reading).toBeUndefined();
  expect(world.takeMoves()).toMatchObject({ type: "poses", list: [{ id: "reader", reading: undefined }] });
});
