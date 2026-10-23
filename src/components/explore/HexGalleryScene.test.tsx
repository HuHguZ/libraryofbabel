import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import * as THREE from "three";
import GalleryWorld from "./HexGalleryScene";
import { ROOM } from "./geometry";

const stream = vi.hoisted(() => ({
  mounted: { GalleryCell: [] as string[], VestibuleCell: [] as string[] },
  removed: { GalleryCell: [] as string[], VestibuleCell: [] as string[] },
  frame: null as null | ((yaw: number, position: THREE.Vector3) => void),
}));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    memo: (component: Parameters<typeof react.memo>[0]) => {
      const name = (component as { name: string }).name;
      if (name === "GalleryCell" || name === "VestibuleCell") {
        return function Cell({ col, level }: { col: number; level: number }) {
          react.useEffect(() => {
            const key = `${col}:${level}`;
            stream.mounted[name].push(key);
            return () => { stream.removed[name].push(key); };
          }, [col, level]);
          return null;
        };
      }
      if (["Staircase", "Mirror", "DistantWorld"].includes(name)) return () => null;
      return react.memo(component);
    },
  };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const jsx = await importOriginal<typeof import("react/jsx-dev-runtime")>();
  const sceneTypes = new Set(["group", "pointLight", "spotLight", "primitive", "fog", "hemisphereLight"]);
  const element = (original: typeof jsx.jsxDEV) => (...[type, props, ...rest]: Parameters<typeof jsx.jsxDEV>) =>
    typeof type === "string" && sceneTypes.has(type)
      ? original("div", { "data-three": type, children: (props as { children?: unknown }).children }, ...rest)
      : original(type, props, ...rest);
  return { ...jsx, jsxDEV: element(jsx.jsxDEV) };
});
vi.mock("@react-three/drei", () => ({ useTexture: { preload: vi.fn() } }));
vi.mock("./Bookcase", async () => ({ default: () => null, ...await import("./bookcasePlan") }));
vi.mock("./materials", () => ({
  ALL_TEXTURE_URLS: [], LAMP_COLOR: "#fff", LibraryMaterialsProvider: () => null,
  useLibraryMaterials: () => ({}),
}));
vi.mock("./GalleryControls", () => ({
  default: ({ onFrame }: { onFrame: typeof stream.frame }) => { stream.frame = onFrame; return null; },
}));

it("keeps the six overlapping galleries mounted when the near floors shift", () => {
  const { container, unmount } = render(<GalleryWorld worldHex="babel"
    initialPose={{ position: new THREE.Vector3(2, ROOM.eyeHeight, 0), yaw: 0, pitch: 0 }}
    interactive="walk" detail={null} hidden={null} shelfSpot={null} deskLamp={null} />);
  expect(stream.mounted.GalleryCell).toHaveLength(9);
  expect(stream.mounted.VestibuleCell).toHaveLength(8);
  expect(container.querySelectorAll('[data-three="pointLight"]')).toHaveLength(10);
  expect(container.querySelectorAll('[data-three="spotLight"]')).toHaveLength(1);
  act(() => stream.frame?.(0, new THREE.Vector3(2, ROOM.level + ROOM.eyeHeight, 0)));
  expect(stream.mounted.GalleryCell).toHaveLength(12);
  expect(stream.removed.GalleryCell).toHaveLength(3);
  // Two near vestibules and the two outer vestibules on the visitor's floor are new.
  expect(stream.mounted.VestibuleCell).toHaveLength(12);
  expect(stream.removed.VestibuleCell).toHaveLength(4);
  expect(container.querySelectorAll('[data-three="pointLight"]')).toHaveLength(10);
  expect(container.querySelectorAll('[data-three="spotLight"]')).toHaveLength(1);
  unmount();
});
