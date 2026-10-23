// @vitest-environment node
import { expect, it } from "vitest";
import { emptyFog, fogFromBase64, fogFromBitString, fogToBase64, fogToBitString, hasBit, setBit } from "./fog";
it("preserves uint8 and Postgres bit order across transports", () => {
  const bits = emptyFog();
  for (const bit of [0, 3, 8, 1000, 1023]) setBit(bits, bit);
  expect(bits[0]).toBe(9);
  expect(hasBit(bits, 1)).toBe(false);
  expect(fogFromBase64(fogToBase64(bits))).toEqual(bits);
  const text = fogToBitString(bits);
  expect(text.slice(0, 10)).toBe("1001000010");
  expect(text).toHaveLength(1024);
  expect(fogFromBitString(text)).toEqual(bits);
  expect(fogFromBase64("!!!")).toEqual(emptyFog());
  setBit(bits, -1);
  setBit(bits, 1024);
  expect(bits).toHaveLength(128);
});
