import { useLayoutEffect } from "react";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { ALL_TEXTURE_URLS, LibraryMaterialsProvider, textureView, useLibraryMaterials, type LibraryMaterials } from "./materials";

const sources = vi.hoisted(() => ({ textures: [] as THREE.Texture[] }));
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } };
vi.mock("@react-three/fiber", () => ({ useThree: (select: (state: unknown) => unknown) => select({ gl: renderer }) }));
vi.mock("@react-three/drei", () => {
  sources.textures = Array.from({ length: 40 }, () => new THREE.Texture());
  return { useTexture: vi.fn(() => sources.textures) };
});

it("creates an owned sampler view without dirtying its unchanged shared image", () => {
  const base = new THREE.Texture();
  base.flipY = false;
  base.minFilter = THREE.LinearFilter;
  base.offset.set(0.1, 0.2);
  const sourceVersion = base.source.version;
  const view = textureView(base);
  expect(view).not.toBe(base);
  expect(view.source).toBe(base.source);
  expect(base.source.version).toBe(sourceVersion);
  expect(view.version).toBeGreaterThan(0);
  expect(view.flipY).toBe(false);
  expect(view.minFilter).toBe(THREE.LinearFilter);
  expect(view.offset).toEqual(base.offset);
  expect(view.offset).not.toBe(base.offset);
  view.dispose();
});

it("shares derived source images while keeping every gallery's materials and sampler views owned", () => {
  const versions = sources.textures.map((texture) => texture.source.version);
  let first!: LibraryMaterials;
  let second!: LibraryMaterials;
  function Capture({ id }: { id: 1 | 2 }) {
    const value = useLibraryMaterials();
    useLayoutEffect(() => { if (id === 1) first = value; else second = value; }, [id, value]);
    return null;
  }
  const { unmount } = render(<>
    <LibraryMaterialsProvider seed={1234}><Capture id={1} /></LibraryMaterialsProvider>
    <LibraryMaterialsProvider seed={1234}><Capture id={2} /></LibraryMaterialsProvider>
  </>);
  expect(sources.textures.map((texture) => texture.source.version)).toEqual(versions);
  expect(first.books[0].cover).not.toBe(second.books[0].cover);
  for (const [a, b] of [[first.textures.gilt, second.textures.gilt], [first.textures.pages, second.textures.pages],
    ...first.textures.spines.map((spine, i) => [spine, second.textures.spines[i]])]) {
    expect(a).not.toBe(b);
    expect(a.source).toBe(b.source);
  }
  unmount();
});

it("reuses the preloaded raw texture set for different gallery plans", () => {
  const { rerender, unmount } = render(<LibraryMaterialsProvider seed={1234}>{null}</LibraryMaterialsProvider>);
  expect(vi.mocked(useTexture)).toHaveBeenLastCalledWith(ALL_TEXTURE_URLS);
  rerender(<LibraryMaterialsProvider seed={5678}>{null}</LibraryMaterialsProvider>);
  expect(vi.mocked(useTexture)).toHaveBeenLastCalledWith(ALL_TEXTURE_URLS);
  unmount();
});
vi.mock("./textTexture", () => ({
  createCanvas: (width: number, height: number) => [{ width, height }, {
    fillRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {}, closePath() {},
  }],
  canvasTexture: (canvas: HTMLCanvasElement) => new THREE.CanvasTexture(canvas),
}));

it("releases every owned texture, including the wood-panel and shelf maps, when a gallery leaves", () => {
  let materials!: LibraryMaterials;
  function Capture() {
    const value = useLibraryMaterials();
    useLayoutEffect(() => { materials = value; }, [value]);
    return null;
  }
  const { unmount } = render(<LibraryMaterialsProvider seed={1234}><Capture /></LibraryMaterialsProvider>);
  const textures = new Set<THREE.Texture>([
    ...Object.values(materials.textures).flat(),
    materials.wood.map!, materials.woodDark.map!,
  ]);
  const disposals = Array.from(textures, (texture) => vi.spyOn(texture, "dispose"));
  unmount();
  disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
});
