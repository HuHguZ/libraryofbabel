// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Player } from "@/lib/online/protocol";
import { createOnlineStore } from "./onlineStore";
import { currentReaders, groupReaders, pickReaderGroup, type MapReader } from "./map";
import { viewAround } from "./mapView";

const centre = { x: 0n, floor: 0n };
const view = viewAround(centre, 20);
const reader = (id: string, x = 0n): MapReader => ({
  player: { id, nick: id, color: "#c9a227", cell: `${x}:0`, p: [0, 0, 0], yaw: 0, view: { kind: "walk", wall: 1 } },
  cell: { x, floor: 0n }, along: 0.5,
});

describe("map reader groups", () => {
  it("keeps every coincident reader selectable in one group", () => {
    const readers = Array.from({ length: 500 }, (_, i) => reader(String(i).padStart(3, "0"))).reverse();
    const groups = groupReaders(readers, view, 800, 600);
    expect(groups).toHaveLength(1);
    expect(groups[0].readers).toHaveLength(500);
    expect(groups[0].readers[0].player.id).toBe("000");
    expect(groups[0].readers[499].player.id).toBe("499");
    expect(pickReaderGroup(groups, 400, 300)?.readers).toHaveLength(500);
    expect(pickReaderGroup(groups, 600, 300)).toBeUndefined();
  });

  it("groups nearby points across hash boundaries with no dependence on roster order", () => {
    const a = reader("a");
    const b = reader("b", 1n);
    const c = reader("c", 2n);
    const groups = groupReaders([c, b, a], view, 800, 600);
    expect(groups.map((group) => group.readers.map((r) => r.player.id))).toEqual([["a", "b"], ["c"]]);
    expect(groups).toEqual(groupReaders([b, a, c], view, 800, 600));
    expect(pickReaderGroup(groups, 440, 300)?.readers[0].player.id).toBe("c");
  });

  it("culls offscreen readers while preserving nearby points at enormous coordinates", () => {
    const far = { x: 10n ** 4000n, floor: -(10n ** 4000n) };
    const near = { ...reader("near"), cell: { ...far, x: far.x + 1n } };
    const groups = groupReaders([reader("offscreen"), near], viewAround(far, 20), 800, 600);
    expect(groups).toHaveLength(1);
    expect(groups[0].x).toBe(420);
    expect(groups[0].readers[0].cell).toEqual({ ...far, x: far.x + 1n });
  });

  it("uses each reader's latest cell and page, and removes departed readers", () => {
    const online = createOnlineStore();
    const player: Player = reader("a").player;
    online.receive({ type: "players", list: [player] }, 0);
    online.receive({ type: "poses", list: [{ ...player, cell: "2:3", view: { kind: "desk", wall: 2, shelf: 3, volume: 4, page: 17 } }] }, 100);
    const latest = currentReaders(online);
    expect(latest[0].cell).toEqual({ x: 2n, floor: 3n });
    expect(latest[0].player.view).toEqual({ kind: "desk", wall: 2, shelf: 3, volume: 4, page: 17 });
    online.receive({ type: "left", id: "a" });
    expect(currentReaders(online)).toEqual([]);
  });
});
