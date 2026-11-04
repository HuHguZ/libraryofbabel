"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ROOM } from "@/components/explore/geometry";
import { useStageSelector, useStageStore } from "@/components/explore/stage/StageProvider";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import { placeAvatar } from "./presence";
import RemoteBooks from "./RemoteBooks";
import { nearbyReaders, readingPosition, type ReaderLayout } from "./remoteReading";

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

function Avatar({ reader }: { reader: ReaderLayout }) {
  const { player } = reader;
  const online = useOnlineStore();
  const stage = useStageStore();
  const gltf = useGLTF(MODEL);
  const model = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene]);
  const skeletons = useMemo(() => {
    const owned = new Set<THREE.Skeleton>();
    model.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) owned.add((o as THREE.SkinnedMesh).skeleton); });
    return owned;
  }, [model]);
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
  useEffect(() => () => { mixer.stopAllAction(); playing.current = null; skeletons.forEach(s => s.dispose()); }, [mixer, skeletons]);

  useFrame(({ camera }, dt) => {
    const g = group.current;
    if (!g) return;
    const place = stage.getSnapshot().place;
    const placed = place ? placeAvatar(online.tracks.get(player.id), place, performance.now()) : null;
    g.visible = placed !== null;
    if (label.current) label.current.style.display = "none";
    if (!placed) return;
    if (placed.view.kind === "desk" && reader.desk !== null) {
      const at = readingPosition(reader);
      g.position.set(at.x, at.y - ROOM.eyeHeight, at.z); g.rotation.y = at.yaw;
    } else {
      g.position.set(placed.x, placed.y - ROOM.eyeHeight, placed.z); g.rotation.y = placed.yaw + MODEL_YAW;
    }
    const clip: Clip = placed.view.kind === "desk" ? "read" : placed.speed > 0.3 ? "walk" : "idle";
    if (clip !== playing.current) {
      if (playing.current) actions[playing.current].fadeOut(0.25);
      actions[clip].reset().fadeIn(0.25).play();
      playing.current = clip;
    }
    if (head) head.rotation.x = headX;
    model.rotation.x = clip === "read" ? 0.08 : 0;
    mixer.update(Math.min(dt, 0.1));
    if (head && clip === "read") head.rotation.x += 0.45;
    if (label.current) label.current.style.display = camera.position.distanceTo(g.position) < LABEL_RANGE ? "block" : "none";
  });

  return (
    <group ref={group} visible={false} name={`remote-player:${player.id}`}>
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
  const place = useStageSelector((s) => s.place);
  const online = useOnlineStore();
  const [readers, setReaders] = useState(() => place ? nearbyReaders(players.values(), online.tracks, place) : []);
  const seen = useRef(new Map<string, string>()), last = useRef({ at: -Infinity, signature: "" });
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current.at < 0.2) return;
    last.current.at = clock.elapsedTime;
    const previous = seen.current, next = new Map<string, string>();
    for (const player of players.values()) {
      const view = online.tracks.get(player.id)?.at(-1)?.view ?? player.view;
      next.set(player.id, view.kind === "desk" ? `${view.wall}:${view.shelf}:${view.volume}` : "");
    }
    const selected = place ? nearbyReaders(players.values(), online.tracks, place).map(r => ({ ...r, arrive: previous.has(r.player.id) && previous.get(r.player.id) !== next.get(r.player.id) && r.view.kind === "desk" })) : [];
    seen.current = next;
    const signature = selected.map(r => `${r.player.id}:${r.player.cell}:${JSON.stringify(r.view)}:${r.col}:${r.level}:${r.desk}:${r.slot}:${r.bookSlot}:${r.arrive}:${r.player.nick}:${r.player.color}`).join("|");
    if (signature !== last.current.signature) { last.current.signature = signature; setReaders(selected); }
  }, -1.75);
  if (!place) return null;
  return (
    <Suspense fallback={null}>
      {readers.map(reader => <Avatar key={reader.player.id} reader={reader} />)}
      <RemoteBooks readers={readers} />
    </Suspense>
  );
}

useGLTF.preload(MODEL);
