import { describe, expect, it } from "vitest";
import { LOUPE, clampPower, formatPower, lensDiameter, lensViewOffset, targetSize, wheelPower, worldRadiusForPixels } from "./loupeMath";

describe("wheelPower", () => {
  it("magnifies more when the wheel rolls up and less when it rolls down", () => {
    expect(wheelPower(2, -100)).toBeCloseTo(2.3);
    expect(wheelPower(2.3, 100)).toBeCloseTo(2);
  });

  it("counts lines and pages as pixels", () => {
    expect(wheelPower(2, -3, 1)).toBeCloseTo(wheelPower(2, -99));
    expect(wheelPower(2, 1, 2)).toBe(LOUPE.minPower);
  });

  it("stays within the loupe's range", () => {
    expect(wheelPower(5.9, -1000)).toBe(LOUPE.maxPower);
    expect(wheelPower(1.6, 1000)).toBe(LOUPE.minPower);
    expect(clampPower(0)).toBe(LOUPE.minPower);
  });
});

describe("lensViewOffset", () => {
  it("crops a square power times smaller than the lens, centred on it", () => {
    expect(lensViewOffset({ x: 800, y: 300 }, 240, 3)).toEqual({ x: 760, y: 260, width: 80, height: 80 });
  });

  it("shows the lens's own area unmagnified at power 1", () => {
    const rect = lensViewOffset({ x: 100, y: 100 }, 50, 1);
    expect(rect.x + rect.width / 2).toBe(100);
    expect(rect.width).toBe(50);
  });
});

describe("lensDiameter", () => {
  it("follows the canvas height, but never grows too wide for a narrow screen", () => {
    expect(lensDiameter(1600, 900)).toBeCloseTo(900 * LOUPE.lensOfHeight);
    expect(lensDiameter(375, 812)).toBeCloseTo(375 * LOUPE.lensOfWidth);
  });
});

describe("targetSize", () => {
  it("steps up to whole blocks and stops at the maximum", () => {
    expect(targetSize(250)).toBe(256);
    expect(targetSize(257)).toBe(320);
    expect(targetSize(1)).toBe(LOUPE.targetStep);
    expect(targetSize(4000)).toBe(LOUPE.maxTarget);
  });
});

describe("worldRadiusForPixels", () => {
  it("is the inverse of perspective projection", () => {
    // A 90° field of view shows 2 world units at depth 1 across the whole height.
    expect(worldRadiusForPixels(450, 1, 90, 900)).toBeCloseTo(1);
    expect(worldRadiusForPixels(90, 2, 90, 900)).toBeCloseTo(0.4);
    expect(worldRadiusForPixels(90, 2, 90, 900, 2)).toBeCloseTo(0.2);
  });
});

describe("formatPower", () => {
  it("uses the locale's decimal mark", () => {
    expect(formatPower(2.5, "en")).toBe("×2.5");
    expect(formatPower(3, "ru")).toBe("×3,0");
  });
});
