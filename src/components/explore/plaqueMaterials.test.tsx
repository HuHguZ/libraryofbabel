import { StrictMode, useLayoutEffect } from "react";
import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { usePlaqueMaterials } from "./plaqueMaterials";

vi.mock("./textTexture", () => ({ makePlaqueTexture: () => new THREE.Texture() }));

it("shares plaques across bookcases and disposes them only after the last owner leaves", async () => {
  let first!: NonNullable<ReturnType<typeof usePlaqueMaterials>>;
  let second!: typeof first;
  function Probe({ id }: { id: 1 | 2 }) {
    const plaques = usePlaqueMaterials("serif", "WALL I");
    useLayoutEffect(() => { if (id === 1) first = plaques!; else second = plaques!; }, [id, plaques]);
    return null;
  }
  const { rerender, unmount } = render(<StrictMode><Probe key="one" id={1} /><Probe key="two" id={2} /></StrictMode>);
  expect(first.wall).toBe(second.wall);
  expect(first.shelves).toEqual(second.shelves);
  const materials = [first.wall, ...first.shelves];
  const materialDisposals = materials.map((material) => vi.spyOn(material, "dispose"));
  const textureDisposals = materials.map((material) => vi.spyOn(material.map!, "dispose"));
  await act(async () => { rerender(<StrictMode><Probe key="two" id={2} /></StrictMode>); });
  materialDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
  expect(second.wall).toBe(first.wall);
  await act(async () => { unmount(); });
  materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  textureDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
});
