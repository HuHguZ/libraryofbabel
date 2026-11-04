import { expect, it } from "vitest";
import * as THREE from "three";
import { pageSample } from "./pageSample";

it("keeps the owner's exact page crop at different camera angles, viewport sizes and zoom", () => {
  const page = new THREE.Object3D();
  page.position.set(4, 0.98, -2); page.rotation.y = 0.7; page.scale.setScalar(0.15); page.updateMatrixWorld();
  const width = 1.42, depth = 2;
  for (const [height, back, aspect, zoom, power] of [[2, 1, 16 / 9, 1, 2.5], [0.5, 3, 4 / 3, 1.7, 6], [0.19, 1, 16 / 9, 1, 3]]) {
    const camera = new THREE.PerspectiveCamera(48, aspect, 0.01, 100);
    const center = new THREE.Vector3(-0.2, 0, -0.3).applyMatrix4(page.matrixWorld);
    camera.position.copy(new THREE.Vector3(-0.2, height, back).applyMatrix4(page.matrixWorld));
    camera.zoom = zoom; camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const ndc = center.clone().project(camera);
    const crop = { x: 0.28 / aspect / power, y: 0.28 / power };
    const matrix = pageSample(page.matrixWorld, camera, width, depth, ndc.x, ndc.y, crop)!;
    expect(matrix[8]).toBe(1);
    const sample = new THREE.Matrix3().fromArray(matrix);
    const inverse = page.matrixWorld.clone().invert();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(page.matrixWorld);
    for (const [x, y] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(ndc.x + x * crop.x, ndc.y + y * crop.y), camera);
      const expected = ray.ray.intersectPlane(plane, new THREE.Vector3())!.applyMatrix4(inverse);
      const actual = new THREE.Vector3(x, y, 1).applyMatrix3(sample);
      expect(actual.x / actual.z).toBeCloseTo(expected.x / width + 0.5, 8);
      expect(actual.y / actual.z).toBeCloseTo(0.5 - expected.z / depth, 8);
    }
  }
});

it("omits an undefined crop when the camera lies in the page plane", () => {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 100);
  camera.position.set(0, 0, 2); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  expect(pageSample(new THREE.Matrix4(), camera, 1.42, 2, 0, 0, { x: 0.1, y: 0.1 })).toBeUndefined();
});
