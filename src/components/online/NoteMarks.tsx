"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ROOM, vestibuleFrame, vestibulePoint } from "@/components/explore/geometry";
import { CASE, planBookcase } from "@/components/explore/bookcasePlan";
import { bookcaseToWorld, bookcaseYaw } from "@/components/explore/stage/deskFrame";
import { useStageSelector } from "@/components/explore/stage/StageProvider";
import type { WorldPlace } from "@/components/explore/HexGalleryScene";
import { hashString } from "@/lib/hex";
import { addressOf, chunkKeyOf, offsetCell, type Cell } from "@/lib/world";
import { useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import type { OnlineStore } from "./onlineStore";

const RIBBON = new THREE.MeshStandardMaterial({ color: "#9e1b2a", roughness: 0.7, side: THREE.DoubleSide });
const RIBBON_GEOMETRY = new THREE.PlaneGeometry(0.014, 0.1);
const SHEET = new THREE.MeshStandardMaterial({ color: "#e6dbc2", roughness: 0.95 });
const SHEET_GEOMETRY = new THREE.PlaneGeometry(0.21, 0.297);
/** The sheet hangs on the wall beside the east doorway, at eye height, in the frame of the vestibule there. */
const SHEET_LOCAL = new THREE.Vector3(-(ROOM.doorWidth / 2 + (ROOM.radius - ROOM.doorWidth) / 4), 1.55, 0.085);

/** Seeds of nearby galleries by cell key: an address takes a few milliseconds. */
const seeds = new Map<string, number>();
const seedOf = (cell: Cell, key: string) => {
  let seed = seeds.get(key);
  if (seed === undefined) {
    if (seeds.size >= 64) seeds.clear();
    seeds.set(key, (seed = hashString(addressOf(cell))));
  }
  return seed;
};

interface Mark {
  key: string;
  kind: "ribbon" | "sheet";
  position: THREE.Vector3;
  rotation: number;
}

/** Ribbons in the books that have notes, and a sheet of paper for galleries with notes, in and beside the visitor's gallery. */
function marksNear(online: OnlineStore, place: WorldPlace): Mark[] {
  const marks: Mark[] = [];
  for (let d = -1; d <= 1; d++) {
    const cell = offsetCell(place.cell, d, 0);
    const notes = online.notesAt(cell);
    if (notes.length === 0) continue;
    const col = place.col + d;
    const key = `${cell.x}:${cell.floor}`;
    if (notes.some((n) => !n.anchor)) {
      const position = new THREE.Vector3(...vestibulePoint(col, place.level, SHEET_LOCAL.x, SHEET_LOCAL.y, SHEET_LOCAL.z));
      marks.push({ key: `${key}:sheet`, kind: "sheet", position, rotation: vestibuleFrame(col, place.level).rotation });
    }
    const seen = new Set<string>();
    for (const n of notes) {
      const a = n.anchor;
      if (!a || seen.has(`${a.wall}-${a.shelf}-${a.volume}`)) continue;
      seen.add(`${a.wall}-${a.shelf}-${a.volume}`);
      const b = planBookcase(seedOf(cell, key), a.wall).placements.find((p) => p.shelf === a.shelf && p.volume === a.volume);
      if (!b) continue;
      // Out of the head of the book, down over the spine.
      const local = { x: b.x, y: b.y + (CASE.bookH * b.scaleY) / 2 - 0.04, z: b.z + CASE.bookD / 2 + 0.003 };
      marks.push({ key: `${key}:${a.wall}-${a.shelf}-${a.volume}`, kind: "ribbon", position: bookcaseToWorld(place.level, col, a.wall, local), rotation: bookcaseYaw(a.wall) });
    }
  }
  return marks;
}

/** The notes of the visitor's gallery and its neighbours, as things in the scene. No lights: they only take the gallery's. */
export default function NoteMarks() {
  const online = useOnlineStore();
  const place = useStageSelector((s) => s.place);
  const version = useOnlineSelector((s) => s.notesVersion);
  useEffect(() => {
    if (place) online.watch([...new Set([-1, 0, 1].map((d) => chunkKeyOf(offsetCell(place.cell, d, 0))))]);
  }, [online, place]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` says the notes changed
  const marks = useMemo(() => (place ? marksNear(online, place) : []), [online, place, version]);
  return (
    <>
      {marks.map((m) => (
        <mesh key={m.key} position={m.position} rotation={[0, m.rotation, 0]} geometry={m.kind === "ribbon" ? RIBBON_GEOMETRY : SHEET_GEOMETRY} material={m.kind === "ribbon" ? RIBBON : SHEET} />
      ))}
    </>
  );
}
