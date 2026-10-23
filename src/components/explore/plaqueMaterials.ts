import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { LIBRARY } from "@/lib/library";
import { makePlaqueTexture } from "./textTexture";

type Plaque = { material: THREE.MeshStandardMaterial; owners: number; key: string };
const plaques = new Map<string, Plaque>();

function plaque(text: string, family: string, wall: boolean): Plaque {
  const key = JSON.stringify([text, family, wall]);
  let found = plaques.get(key);
  if (!found) {
    const map = makePlaqueTexture(text, family, { width: wall ? 640 : 160, height: 96, fontSize: wall ? 52 : 60, letterSpacing: wall ? 6 : 0 });
    found = { key, owners: 0, material: new THREE.MeshStandardMaterial({
      map, roughness: 0.4, metalness: 0.5, emissive: new THREE.Color("#3a2a10"), emissiveIntensity: 0.4,
    }) };
    plaques.set(key, found);
  }
  return found;
}

/** Wall labels and shelf numbers are identical across galleries; keep one copy while any bookcase uses it. */
export function usePlaqueMaterials(family: string | null, wallLabel: string) {
  const resources = useMemo(() => family ? [plaque(wallLabel, family, true),
    ...Array.from({ length: LIBRARY.shelves }, (_, i) => plaque(`${i + 1}`, family, false))] : null, [family, wallLabel]);
  useEffect(() => {
    resources?.forEach((resource) => resource.owners++);
    return () => {
      resources?.forEach((resource) => resource.owners--);
      // StrictMode reattaches effects immediately; only the last real owner releases the shared textures.
      queueMicrotask(() => resources?.forEach((resource) => {
        if (resource.owners || plaques.get(resource.key) !== resource) return;
        resource.material.map?.dispose();
        resource.material.dispose();
        plaques.delete(resource.key);
      }));
    };
  }, [resources]);
  return useMemo(() => resources ? { wall: resources[0].material, shelves: resources.slice(1).map((resource) => resource.material) } : null, [resources]);
}
