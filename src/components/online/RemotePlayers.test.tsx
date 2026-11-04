import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import * as THREE from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Player } from "@/lib/online/protocol";
import RemotePlayers from "./RemotePlayers";

const player: Player = { id: "other", nick: "Reader", color: "#b02e3a", cell: "0:0", p: [0, 1.6, 0], yaw: 0, view: { kind: "walk", wall: 1 } };
const players = new Map([[player.id, player]]);
let frame: (state: { camera: THREE.PerspectiveCamera }, dt: number) => void;
let gltf: ReturnType<typeof model>;
let placed = { x: 0, y: 1.6, z: 0, yaw: 0, speed: 0, view: player.view };
function model() {
  const scene = new THREE.Group();
  const bone = new THREE.Bone(), skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  skin.name = "skin"; scene.add(bone, skin); skin.bind(new THREE.Skeleton([bone]));
  const animations = ["HumanArmature|Man_Idle", "HumanArmature|Man_Walk"].map(name => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack(".position[x]", [0, 1], [0, 1])]));
  return { scene, animations };
}
vi.mock("@react-three/fiber", () => ({ useFrame: (callback: typeof frame) => { frame = callback; } }));
vi.mock("@react-three/drei", () => ({ Html: () => null, useGLTF: Object.assign(() => gltf, { preload: () => {} }) }));
const stageSnapshot = { place: { col: 0, level: 0, cell: { x: 0n, floor: 0n } } };
vi.mock("@/components/explore/stage/StageProvider", () => ({ useStageSelector: (select: (s: typeof stageSnapshot) => unknown) => select(stageSnapshot), useStageStore: () => ({ getSnapshot: () => stageSnapshot }) }));
vi.mock("./OnlineProvider", () => ({ useOnlineSelector: () => players, useOnlineStore: () => ({ tracks: new Map() }) }));
vi.mock("./presence", () => ({ placeAvatar: () => placed }));
vi.mock("./RemoteBooks", () => ({ default: () => null }));

beforeEach(() => {
  gltf = model(); placed = { x: 0, y: 1.6, z: 0, yaw: 0, speed: 0, view: player.view };
  const error = console.error;
  vi.spyOn(console, "error").mockImplementation((...args) => {
    // The real browser uses R3F, while this lifecycle test hosts its three JSX tags in jsdom.
    if (String(args[0]).includes("The tag <%s>") && ["primitive", "group"].includes(args[1])) return;
    if (String(args[0]).includes("non-boolean attribute") && args[2] === "visible") return;
    error(...args);
  });
});
it("disposes owned skeleton textures on culling without disposing the shared model geometry", () => {
  const dispose = vi.spyOn(THREE.Skeleton.prototype, "dispose");
  const source = gltf.scene.getObjectByName("skin") as THREE.SkinnedMesh;
  const geometry = vi.spyOn(source.geometry, "dispose");
  const view = render(<StrictMode><RemotePlayers /></StrictMode>);
  expect(dispose).toHaveBeenCalled();
  const owned = dispose.mock.contexts[0] as THREE.Skeleton;
  expect(owned).not.toBe(source.skeleton);
  owned.computeBoneTexture();
  expect(owned.boneTexture).not.toBeNull();
  view.unmount();
  expect(owned.boneTexture).toBeNull();
  expect(geometry).not.toHaveBeenCalled();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("plays real Three.js actions after StrictMode cleanup, clip changes and a model refresh", () => {
  const play = vi.spyOn(THREE.AnimationAction.prototype, "play");
  const stop = vi.spyOn(THREE.AnimationMixer.prototype, "stopAllAction");
  const view = render(<StrictMode><RemotePlayers /></StrictMode>);
  // jsdom hosts the JSX tags; the frame only needs these two Three.js group properties.
  Object.assign(document.querySelector("group")!, { position: new THREE.Vector3(), rotation: new THREE.Euler() });
  const tick = () => act(() => frame({ camera: new THREE.PerspectiveCamera() }, 1 / 60));
  expect(stop).toHaveBeenCalled();
  expect(tick).not.toThrow();
  expect(play).toHaveBeenCalledTimes(1);
  placed.speed = 1; tick();
  placed.view = { kind: "desk", wall: 1, shelf: 1, volume: 1, page: 4 }; tick();
  placed.view = player.view; placed.speed = 0; tick();
  expect(play).toHaveBeenCalledTimes(4);
  gltf = model();
  view.rerender(<StrictMode><RemotePlayers /></StrictMode>);
  tick();
  expect(play).toHaveBeenCalledTimes(5);
  const stops = stop.mock.calls.length;
  view.unmount();
  expect(stop.mock.calls.length).toBeGreaterThan(stops);
});
