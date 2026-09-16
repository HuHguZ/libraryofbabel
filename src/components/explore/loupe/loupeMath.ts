/**
 * The arithmetic of the loupe, kept free of three.js so it can be tested headless.
 *
 * The loupe shows the part of the view under its lens `power` times larger: the scene is rendered a second
 * time through a camera whose view is cropped (PerspectiveCamera.setViewOffset) to a square `power` times
 * smaller than the lens, centred where the lens is on the screen, and that picture is laid over the lens.
 */

export const LOUPE = {
  minPower: 1.5,
  maxPower: 6,
  defaultPower: 2.5,
  /** Lens diameter as a share of the canvas height, and at most this share of its width (narrow screens). */
  lensOfHeight: 0.28,
  lensOfWidth: 0.42,
  /** The magnified picture is rendered at the lens's own size on the screen, up to this many pixels square. */
  maxTarget: 1024,
  /** Render target sizes step by this much, so small changes of the canvas do not reallocate it. */
  targetStep: 64,
} as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const clampPower = (power: number) => Math.min(LOUPE.maxPower, Math.max(LOUPE.minPower, power));

/**
 * The power after a wheel event: each notch (100 px of `deltaY`) multiplies or divides it by 1.15,
 * scrolling up (negative `deltaY`) magnifies more. Line and page scrolling are converted to pixels.
 */
export function wheelPower(power: number, deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 800 : deltaY;
  return clampPower(power * Math.pow(1.15, -pixels / 100));
}

/** Diameter of the lens on a canvas this large, in the canvas's own units. */
export function lensDiameter(width: number, height: number): number {
  return Math.min(height * LOUPE.lensOfHeight, width * LOUPE.lensOfWidth);
}

/**
 * The part of the full view the lens magnifies, top-left origin, in the units of `view`:
 * a square `power` times smaller than the lens, centred on the lens.
 */
export function lensViewOffset(center: { x: number; y: number }, diameter: number, power: number): Rect {
  const size = diameter / power;
  return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size };
}

/** Side of the square render target for a lens this many device pixels across. */
export function targetSize(diameterPixels: number): number {
  const stepped = Math.ceil(diameterPixels / LOUPE.targetStep) * LOUPE.targetStep;
  return Math.min(LOUPE.maxTarget, Math.max(LOUPE.targetStep, stepped));
}

/**
 * World radius an object needs at `depth` in front of a perspective camera to look `pixels` wide
 * (a radius) on a view `viewHeight` pixels tall.
 */
export function worldRadiusForPixels(pixels: number, depth: number, fovDegrees: number, viewHeight: number, zoom = 1): number {
  const halfHeight = depth * Math.tan((fovDegrees * Math.PI) / 360) / zoom;
  return (pixels / (viewHeight / 2)) * halfHeight;
}

/** Formats the power for the little label beside the lens: "×2.5", with the locale's decimal mark. */
export function formatPower(power: number, locale?: string): string {
  return `×${power.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}
