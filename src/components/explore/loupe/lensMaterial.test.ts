import { expect, it } from "vitest";
import { createLensMaterial } from "./lensMaterial";

it("keeps local screen sampling when a peer sets its own page footprint", () => {
  const lens = { center: { x: 0, y: 0.2055 }, radius: 0.0652 };
  const local = createLensMaterial(lens, null), peer = createLensMaterial(lens, null);
  peer.uniforms.uUsePageSample.value = true;
  peer.uniforms.uPageSample.value.set(0.1, 0, 0.5, 0, 0.2, 0.4, 0.01, 0, 1);
  expect(local.uniforms.uUsePageSample.value).toBe(false);
  expect(local.uniforms.uPageSample.value.elements).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  expect(peer.uniforms.uPageSample.value.elements).toEqual([0.1, 0, 0.01, 0, 0.2, 0, 0.5, 0.4, 1]);
  local.dispose(); peer.dispose();
});
