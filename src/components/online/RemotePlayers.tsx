"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ROOM } from "@/components/explore/geometry";
import { useStageSelector, useStageStore } from "@/components/explore/stage/StageProvider";
import type { Player } from "@/lib/online/protocol";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import { placeAvatar } from "./presence";

const MODEL = "/models/reader.glb";
/** Clip names in reader.glb (see public/models/README.md); "read" falls back to idle with the head bowed. */
const CLIPS = { idle: "HumanArmature|Man_Idle", walk: "HumanArmature|Man_Walk", read: "HumanArmature|Man_Idle" } as const;
/** Materials of reader.glb tinted with the player's colour. */
const TINTED = /^(Shirt|Pants|Socks)$/;
/** reader.glb is MODEL_HEIGHT metres tall and faces +z; scaled to a visitor's height and turned to look along yaw. */
const MODEL_SCALE = 0.3636776933;
const MODEL_YAW = Math.PI;
/** Labels are hidden beyond this distance (m): they would show through walls. */
const LABEL_RANGE = 14;

type Clip = keyof typeof CLIPS;

function Avatar({ player }: { player: Player }) {
  const online = useOnlineStore();
  const stage = useStageStore();
  const gltf = useGLTF(MODEL);
  const model = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => {
    const out = {} as Record<Clip, THREE.AnimationAction>;
    for (const [key, name] of Object.entries(CLIPS) as [Clip, string][]) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name) ?? gltf.animations[0];
      out[key] = mixer.clipAction(clip);
    }
    return out;
  }, [mixer, gltf.animations]);
  const head = useMemo(() => model.getObjectByName("Head") ?? null, [model]);
  const headX = useMemo(() => head?.rotation.x ?? 0, [head]);
  const group = useRef<THREE.Group>(null);
  const label = useRef<HTMLDivElement>(null);
  const playing = useRef<Clip | null>(null);

  // Each avatar has its own copies of the tinted materials, in its player's colour.
  useEffect(() => {
    const made: THREE.Material[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const tint = (material: THREE.Material) => {
        if (!TINTED.test(material.name) || !(material instanceof THREE.MeshStandardMaterial)) return material;
        const tinted = material.clone();
        tinted.color.set(player.color);
        made.push(tinted);
        return tinted;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
    });
    return () => made.forEach((m) => m.dispose());
  }, [model, player.color]);

  // Effect cleanup can replay while cached actions are still used; the per-avatar mixer is garbage-collected on unmount.
  useEffect(() => () => { mixer.stopAllAction(); playing.current = null; }, [mixer]);

  useFrame(({ camera }, dt) => {
    const g = group.current;
    if (!g) return;
    const place = stage.getSnapshot().place;
    const placed = place ? placeAvatar(online.tracks.get(player.id), place, performance.now()) : null;
    g.visible = placed !== null;
    if (label.current) label.current.style.display = "none";
    if (!placed) return;
    g.position.set(placed.x, placed.y - ROOM.eyeHeight, placed.z);
    g.rotation.y = placed.yaw + MODEL_YAW;
    const clip: Clip = placed.view.kind === "desk" ? "read" : placed.speed > 0.3 ? "walk" : "idle";
    if (clip !== playing.current) {
      if (playing.current) actions[playing.current].fadeOut(0.25);
      actions[clip].reset().fadeIn(0.25).play();
      playing.current = clip;
    }
    if (head) head.rotation.x = headX;
    mixer.update(Math.min(dt, 0.1));
    if (head && clip === "read") head.rotation.x += 0.45;
    if (label.current) label.current.style.display = camera.position.distanceTo(g.position) < LABEL_RANGE ? "block" : "none";
  });

  return (
    <group ref={group} visible={false}>
      <primitive object={model} scale={MODEL_SCALE} />
      <Html position={[0, ROOM.eyeHeight + 0.45, 0]} center occlude style={{ pointerEvents: "none" }}>
        <div
          ref={label}
          style={{
            display: "none",
            font: "500 12px var(--font-jetbrains), monospace",
            color: player.color,
            whiteSpace: "nowrap",
            textShadow: "0 0 4px #000, 0 0 8px #000",
          }}
        >
          {player.nick}
        </div>
      </Html>
    </group>
  );
}

/** The other visitors of this Library near the visitor, as readers in their colours. */
export default function RemotePlayers() {
  const players = useOnlineSelector((s) => s.players);
  const ready = useStageSelector((s) => s.place !== null);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      {[...players.values()].map((p) => (
        <Avatar key={p.id} player={p} />
      ))}
    </Suspense>
  );
}

useGLTF.preload(MODEL);
