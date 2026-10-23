// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DIGS, MAX_ADDRESS_LENGTH } from "./library";
import {
  CENTRE,
  spawnHex,
  GALLERIES,
  addressAt,
  addressIndex,
  addressOf,
  cellKey,
  cellNearCentre,
  cellOf,
  formatCoordinate,
  offsetCell,
  parseCellKey,
} from "./world";

const randomHex = (length: number) => Array.from({ length }, () => DIGS[Math.floor(Math.random() * DIGS.length)]).join("");

describe("gallery numbers", () => {
  it("count addresses by length, then as numbers", () => {
    expect(addressIndex("0")).toBe(0n);
    expect(addressIndex("Z")).toBe(61n);
    expect(addressIndex("00")).toBe(62n);
    expect(addressAt(0n)).toBe("0");
    expect(addressAt(62n)).toBe("00");
    expect(addressAt(GALLERIES - 1n)).toBe("Z".repeat(MAX_ADDRESS_LENGTH));
  });

  it("go both ways for addresses of every length", () => {
    for (const length of [1, 2, 7, 8, 9, 100, MAX_ADDRESS_LENGTH]) {
      const hex = randomHex(length);
      expect(addressAt(addressIndex(hex))).toBe(hex);
    }
  });
});

describe("cells", () => {
  it("give every address one cell, and that cell its address back", () => {
    for (const hex of ["babel", "0", "000", "Z", randomHex(1234), randomHex(MAX_ADDRESS_LENGTH)]) expect(addressOf(cellOf(hex))).toBe(hex);
  });

  it("give every cell its own address, near the centre and far away", () => {
    const seen = new Set<string>();
    for (let x = -6; x <= 6; x++) {
      for (let f = -6; f <= 6; f++) {
        const cell = { x: BigInt(x), floor: BigInt(f) };
        const hex = addressOf(cell);
        expect(cellOf(hex)).toEqual(cell);
        seen.add(hex);
      }
    }
    expect(seen.size).toBe(13 * 13);
    const far = { x: 10n ** 4000n + 7n, floor: -(10n ** 3999n) };
    expect(cellOf(addressOf(far))).toEqual(far);
  });

  it("give neighbours unrelated addresses, so their books do not share the start of every page", () => {
    const a = addressOf(CENTRE);
    for (const b of [addressOf(offsetCell(CENTRE, 1, 0)), addressOf(offsetCell(CENTRE, 0, 1))]) {
      let same = 0;
      for (let i = 0; i < 200; i++) if (a[i] === b[i]) same++;
      expect(same).toBeLessThan(20);
    }
  });

  it("travel as keys", () => {
    const cell = { x: -12n, floor: 10n ** 50n };
    expect(parseCellKey(cellKey(cell))).toEqual(cell);
    expect(cellKey({ x: 3n, floor: -4n })).toBe("3:-4");
    expect(parseCellKey("1:x")).toBeNull();
    expect(parseCellKey(`1:${"9".repeat(5001)}`)).toBeNull();
  });

  it("put newcomers near the centre", () => {
    for (let i = 0; i < 200; i++) {
      const c = cellNearCentre();
      expect(c.x >= -50n && c.x <= 50n && c.floor >= -20n && c.floor <= 20n).toBe(true);
    }
    expect(cellNearCentre(() => 0)).toEqual({ x: -50n, floor: -20n });
  });

  it("write coordinates for people", () => {
    expect(formatCoordinate(0n)).toBe("0");
    expect(formatCoordinate(-42n)).toBe("−42");
    expect(formatCoordinate(999999n)).toBe("999999");
    expect(formatCoordinate(31415926n)).toBe("3.14·10^7");
    expect(formatCoordinate(-(10n ** 4318n))).toBe("−1.00·10^4318");
  });
});

  it("spawns at an address near the centre", () => {
    const cell = cellOf(spawnHex());
    expect(cell.x >= -50n && cell.x <= 50n && cell.floor >= -20n && cell.floor <= 20n).toBe(true);
  });
import { bitCell, cellBit, chunkKeyOf, chunkOf } from "./world";
describe("chunks", () => {
  it("cut the Library into 32 × 32 galleries, rounding down below zero", () => {
    expect(chunkOf({ x: 0n, floor: 0n })).toEqual({ x: 0n, floor: 0n });
    expect(chunkOf({ x: 31n, floor: 32n })).toEqual({ x: 0n, floor: 1n });
    expect(chunkOf({ x: -1n, floor: -32n })).toEqual({ x: -1n, floor: -1n });
    expect(chunkOf({ x: -33n, floor: -1n })).toEqual({ x: -2n, floor: -1n });
    expect(chunkKeyOf({ x: -1n, floor: 40n })).toBe("-1:1");
  });

  it("give every gallery of a chunk its own bit, and back", () => {
    expect(cellBit({ x: 0n, floor: 0n })).toBe(0);
    expect(cellBit({ x: -1n, floor: -1n })).toBe(1023);
    expect(cellBit({ x: 33n, floor: 2n })).toBe(1 + 32 * 2);
    for (const cell of [{ x: -1n, floor: -1n }, { x: 12345n, floor: -678n }, { x: 10n ** 400n, floor: -(10n ** 399n) - 5n }]) {
      expect(bitCell(chunkOf(cell), cellBit(cell))).toEqual(cell);
    }
  });
});
