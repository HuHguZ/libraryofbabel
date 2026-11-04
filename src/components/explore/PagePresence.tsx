"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ColoredFragment } from "@/lib/fragment";
import type { SharedLoupe } from "@/components/online/remoteReading";
import { PAGE, TEXT_CANVAS, layoutPage } from "./bookPages";
import { annotationBands } from "./pageAnnotations";
import PeerLoupes from "./loupe/PeerLoupes";

export default function PagePresence({ page, content, family, highlights = [], getLoupes, shown }: { page: number; content: string; family: string | null; highlights?: ColoredFragment[]; getLoupes?: () => SharedLoupe[]; shown: () => boolean }) {
  const measure = useMemo(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx || !family) return null;
    ctx.font = `500 ${layoutPage(content).fontSize}px ${family}`;
    const widths = new Map<string, number>();
    return (text: string) => { let width = widths.get(text); if (width === undefined) { width = ctx.measureText(text).width; widths.set(text, width); } return width; };
  }, [content, family]);
  const bands = useMemo(() => measure && content ? highlights.filter(h => h.page === page).flatMap(h => annotationBands(content, h.start, h.end, measure).map(rect => ({ ...rect, color: h.color }))) : [], [content, measure, highlights, page]);
  const capacity = 2 ** Math.ceil(Math.log2(Math.max(1, bands.length)));
  const marks = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = "live-highlights"; mesh.frustumCulled = false; mesh.raycast = () => {};
    return mesh;
  }, [capacity]);
  useEffect(() => () => { marks.geometry.dispose(); (marks.material as THREE.Material).dispose(); marks.dispose(); }, [marks]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    bands.forEach((b, n) => {
      matrix.makeScale(b.width / TEXT_CANVAS.w * PAGE.w, 1, b.height / TEXT_CANVAS.h * PAGE.d);
      matrix.setPosition(((b.x + b.width / 2) / TEXT_CANVAS.w - 0.5) * PAGE.w, 0.002, ((b.y + b.height / 2) / TEXT_CANVAS.h - 0.5) * PAGE.d);
      marks.setMatrixAt(n, matrix); marks.setColorAt(n, color.set(b.color));
    });
    marks.count = bands.length; marks.instanceMatrix.needsUpdate = true; if (marks.instanceColor) marks.instanceColor.needsUpdate = true;
  }, [marks, bands]);
  useFrame(() => { marks.visible = shown(); });
  return <group dispose={null}>
    <primitive object={marks} />
    <PeerLoupes page={page} getLoupes={getLoupes} shown={shown} />
  </group>;
}
