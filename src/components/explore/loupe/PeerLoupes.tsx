"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { SharedLoupe } from "@/components/online/remoteReading";
import { PAGE } from "../bookPages";
import { LOUPE_MODEL_URL } from "./Loupe";
import { createLensMaterial } from "./lensMaterial";

const MODEL_LENS = { center: { x: 0, y: 0.2055 }, radius: 0.0652 };
const RADIUS = 0.2;
type Props = { page: number; getLoupes?: () => SharedLoupe[]; shown: () => boolean };

/** The model is fetched only when another reader brings a loupe onto this page. */
export default function PeerLoupes({ page, getLoupes, shown }: Props) {
  const [wanted, setWanted] = useState(false);
  const latest = useRef<SharedLoupe[]>([]);
  const polled = useRef(-Infinity);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - polled.current < 0.1) return;
    polled.current = clock.elapsedTime;
    latest.current = shown() ? (getLoupes?.() ?? []).filter(l => l.page === page && Number.isFinite(l.u) && Number.isFinite(l.v) && l.u >= 0 && l.u <= 1 && l.v >= 0 && l.v <= 1 && Number.isFinite(l.power) && l.power >= 1.5 && l.power <= 6).slice(0, 4) : [];
    if (latest.current.length && !wanted) setWanted(true);
  }, -3);
  return wanted ? <WithoutPeerLoupesOnError><Suspense fallback={null}><LoadedPeerLoupes latest={latest} shown={shown} /></Suspense></WithoutPeerLoupesOnError> : null;
}

class WithoutPeerLoupesOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn("The shared loupe could not be shown:", error); }
  render() { return this.state.failed ? null : this.props.children; }
}

function LoadedPeerLoupes({ latest, shown }: { latest: RefObject<SharedLoupe[]>; shown: () => boolean }) {
  const gltf = useGLTF(LOUPE_MODEL_URL, false, false);
  const parts = useMemo(() => {
    let frame: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
    let glass: typeof frame;
    gltf.scene.traverse(object => {
      const mesh = object as NonNullable<typeof frame>;
      if (!mesh.isMesh) return;
      if (mesh.material.name.endsWith("_lense")) glass = mesh;
      else frame = mesh;
    });
    if (!frame || !glass) throw new Error("The loupe model has no frame or no lens");
    return { frame: frame.geometry, glass: glass.geometry, material: frame.material, surface: glass.material.roughnessMap };
  }, [gltf]);
  const slots = useMemo(() => Array.from({ length: 4 }, () => {
    const frameMaterial = parts.material.clone();
    frameMaterial.aoMap = parts.surface;
    const lensMaterial = createLensMaterial(MODEL_LENS, parts.surface);
    lensMaterial.side = THREE.DoubleSide;
    lensMaterial.uniforms.uUsePageSample.value = true;
    return {
      group: null as THREE.Group | null, glass: null as THREE.Mesh | null,
      frameMaterial, lensMaterial,
    };
  }), [parts]);
  useEffect(() => () => { slots.forEach(slot => { slot.frameMaterial.dispose(); slot.lensMaterial.dispose(); }); }, [slots]);

  useFrame((_, dt) => {
    const visible = shown();
    slots.forEach((slot, n) => {
      const group = slot.group, value = latest.current[n];
      if (!group) return;
      const wasVisible = group.visible;
      group.visible = visible && !!value;
      if (!group.visible || !value) return;
      const x = (value.u - 0.5) * PAGE.w, z = (0.5 - value.v) * PAGE.d;
      if (wasVisible) {
        group.position.x = THREE.MathUtils.damp(group.position.x, x, 20, Math.min(dt, 0.1));
        group.position.z = THREE.MathUtils.damp(group.position.z, z, 20, Math.min(dt, 0.1));
      } else group.position.set(x, 0.04, z);
      group.userData.power = value.power; group.userData.page = value.page;
      let ancestor = group.parent;
      let pageTexture: THREE.Texture | null = null;
      while (ancestor) {
        const mesh = ancestor as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
        if (!pageTexture && mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.map) pageTexture = mesh.material.map;
        ancestor = ancestor.parent;
      }
      if (slot.glass) slot.glass.visible = !!pageTexture && !!value.sample;
      if (!pageTexture || !value.sample) return;
      slot.lensMaterial.uniforms.uView.value = pageTexture;
      slot.lensMaterial.uniforms.uPageSample.value.fromArray(value.sample);
    });
  }, -2);

  return <group dispose={null}>{slots.map((slot, n) => <group key={n} name="peer-loupe" visible={false} ref={group => { slot.group = group; }}>
    <group rotation={[-Math.PI / 2, 0, 0.45]} scale={RADIUS / MODEL_LENS.radius}>
      <group position={[0, -MODEL_LENS.center.y, 0]}>
        <mesh geometry={parts.frame} material={slot.frameMaterial} raycast={() => {}} />
        <mesh geometry={parts.glass} material={slot.lensMaterial} visible={false} ref={mesh => { slot.glass = mesh; }} raycast={() => {}} />
      </group>
    </group>
  </group>)}</group>;
}
