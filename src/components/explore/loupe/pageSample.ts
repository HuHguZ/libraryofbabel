import { Matrix3, Matrix4, type Camera } from "three";
import type { LoupeSample } from "@/lib/online/protocol";

/** Owner lens coordinates -> page UV, preserving the crop's perspective and magnification. */
export function pageSample(page: Matrix4, camera: Camera, width: number, depth: number, x: number, y: number, crop: { x: number; y: number }): LoupeSample | undefined {
  const e = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(page).elements;
  const uvToClip = new Matrix3().set(
    e[0] * width, -e[8] * depth, e[12] - e[0] * width / 2 + e[8] * depth / 2,
    e[1] * width, -e[9] * depth, e[13] - e[1] * width / 2 + e[9] * depth / 2,
    e[3] * width, -e[11] * depth, e[15] - e[3] * width / 2 + e[11] * depth / 2,
  );
  const sample = uvToClip.invert().multiply(new Matrix3().set(crop.x, 0, x, 0, crop.y, y, 0, 0, 1));
  sample.multiplyScalar(1 / sample.elements[8]);
  if (!sample.elements.every(n => Number.isFinite(n) && Math.abs(n) <= 10000)) return undefined;
  sample.elements[8] = 1;
  return sample.toArray() as LoupeSample;
}
