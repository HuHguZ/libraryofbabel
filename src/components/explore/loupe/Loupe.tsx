"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { useLocale } from "next-intl";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { isCenterAim, setLoupeCursor } from "../cursor";
import { createLensMaterial } from "./lensMaterial";
import { LOUPE, formatPower, lensDiameter, lensViewOffset, targetSize, wheelPower, worldRadiusForPixels } from "./loupeMath";

/** "Magnifying Glass 01" by Nazar Borodavka, Poly Haven (CC0): upright, the handle down, the lens facing ±z. */
export const LOUPE_MODEL_URL = "/models/magnifying_glass_01/magnifying_glass_01_2k.gltf";
const MODEL_LENS = { center: { x: 0, y: 0.2055 }, radius: 0.0652 };

/**
 * The loupe hangs this many near-plane distances in front of the eye. Its size on the screen does not depend
 * on it (the model is scaled with the depth), but this close nothing in the scene can come between the eye
 * and the loupe or cut through it.
 */
const DEPTH_IN_NEARS = 4;
/** How it is held: the handle towards the lower right, the lens leaning back a little like one held over a page. */
const HOLD = { roll: 0.55, tilt: -0.32, yaw: 0.18 };

export interface LoupeProps {
  /**
   * In hand: the loupe takes the place of the cursor over the canvas (or sits at the reticle while the mouse is
   * captured) and shows whatever lies under it magnified. Put it in any scene after the scene's own content.
   */
  active: boolean;
  /** Magnification it starts with; the wheel changes it while the loupe is in hand. */
  defaultPower?: number;
}

/** The loupe for any scene. Its model is fetched the first time it is taken, not with the scene. */
export default function Loupe({ active, defaultPower = LOUPE.defaultPower }: LoupeProps) {
  const [wanted, setWanted] = useState(false);
  if (active && !wanted) setWanted(true);
  if (!wanted) return null;
  return (
    <WithoutLoupeOnError>
      <Suspense fallback={null}>
        <LoupeInHand active={active} defaultPower={defaultPower} />
      </Suspense>
    </WithoutLoupeOnError>
  );
}

/** A model that fails to load takes only the loupe away, never the scene around it. */
class WithoutLoupeOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("The loupe could not be shown:", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A small room lighting the frame of the loupe, made once per renderer. */
const environments = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
function roomEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  let texture = environments.get(gl);
  if (!texture) {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    texture = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    environments.set(gl, texture);
  }
  return texture;
}

function LoupeInHand({ active, defaultPower }: { active: boolean; defaultPower: number }) {
  const gltf = useGLTF(LOUPE_MODEL_URL, false, false);
  const gl = useThree((s) => s.gl);
  const locale = useLocale();
  const group = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  /* ── The model: its own frame material, and glass that shows the magnified view ── */
  const parts = useMemo(() => {
    let body: THREE.Mesh | null = null;
    let lens: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if ((mesh.material as THREE.Material).name.endsWith("_lense")) lens = mesh;
      else body = mesh;
    });
    if (!body || !lens) throw new Error("The loupe model has no frame or no lens");
    const frame = (body as THREE.Mesh).material as THREE.MeshStandardMaterial;
    // The glass carries the AO / roughness / metal map: ambient occlusion for the frame, smudges for the glass.
    const surface = ((lens as THREE.Mesh).material as THREE.MeshStandardMaterial).roughnessMap;
    const frameMaterial = frame.clone();
    frameMaterial.aoMap = surface;
    frameMaterial.envMap = roomEnvironment(gl);
    frameMaterial.envMapIntensity = 0.35;
    const lensMaterial = createLensMaterial(MODEL_LENS, surface);
    return { frame: (body as THREE.Mesh).geometry, glass: (lens as THREE.Mesh).geometry, frameMaterial, lensMaterial };
  }, [gltf, gl]);
  useEffect(
    () => () => {
      parts.frameMaterial.dispose();
      parts.lensMaterial.dispose();
    },
    [parts]
  );

  /* ── The magnified view is rendered into this target through a camera cropped to the lens ── */
  const target = useMemo(() => new THREE.WebGLRenderTarget(LOUPE.targetStep, LOUPE.targetStep, { type: THREE.HalfFloatType, samples: 4 }), []);
  useEffect(() => () => target.dispose(), [target]);
  const viewCamera = useMemo(() => new THREE.PerspectiveCamera(), []);
  useEffect(() => {
    parts.lensMaterial.uniforms.uView.value = target.texture;
  }, [parts, target]);

  /* ── The pointer: whether it is over the canvas, and the wheel for the power ── */
  const inside = useRef(false);
  const power = useRef(defaultPower);
  const [label, setLabel] = useState({ text: formatPower(defaultPower, locale), n: 0, shown: false });
  // Taking the loupe shows its power for a moment, so the wheel is easy to discover.
  const [wasActive, setWasActive] = useState(false);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setLabel((l) => ({ text: formatPower(power.current, locale), n: l.n + 1, shown: true }));
  }
  useEffect(() => {
    if (!label.shown) return;
    const timer = setTimeout(() => setLabel((l) => ({ ...l, shown: false })), 1200);
    return () => clearTimeout(timer);
  }, [label.n, label.shown]);

  useEffect(() => {
    const canvas = gl.domElement;
    const enter = () => {
      inside.current = true;
    };
    // A finger lifted from the screen leaves the canvas, but the loupe stays where it was put.
    const leave = (e: PointerEvent) => {
      if (e.pointerType !== "touch") inside.current = false;
    };
    canvas.addEventListener("pointermove", enter);
    canvas.addEventListener("pointerdown", enter);
    canvas.addEventListener("pointerleave", leave);
    return () => {
      canvas.removeEventListener("pointermove", enter);
      canvas.removeEventListener("pointerdown", enter);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, [gl]);

  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement;
    setLoupeCursor(canvas, true);
    // Caught before the scene's own controls see it: while the loupe is in hand the wheel is its power.
    const onWheel = (e: WheelEvent) => {
      if (e.target !== canvas) return;
      e.preventDefault();
      e.stopPropagation();
      power.current = wheelPower(power.current, e.deltaY, e.deltaMode);
      setLabel((l) => ({ text: formatPower(power.current, locale), n: l.n + 1, shown: true }));
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      setLoupeCursor(canvas, false);
    };
  }, [active, gl, locale]);

  /* ── Every frame: follow the pointer, lean with the motion, render what the lens magnifies ── */
  const presence = useRef(0);
  const sway = useRef({ x: 0, y: 0, lastX: 0, lastY: 0 });
  const scratch = useMemo(
    () => ({
      buffer: new THREE.Vector2(),
      point: new THREE.Vector3(),
      up: new THREE.Vector3(),
      look: new THREE.Matrix4(),
      hold: new THREE.Quaternion(),
      euler: new THREE.Euler(0, 0, 0, "ZXY"),
    }),
    []
  );

  useFrame((state, dt) => {
    const loupe = group.current;
    if (!loupe) return;
    const step = Math.min(dt, 0.05);
    const canvas = state.gl.domElement;
    const camera = state.camera as THREE.PerspectiveCamera;
    const captured = document.pointerLockElement === canvas || isCenterAim(canvas);
    const shown = active && camera.isPerspectiveCamera && (inside.current || captured);
    presence.current = THREE.MathUtils.damp(presence.current, shown ? 1 : 0, 16, step);
    if (!shown && presence.current < 0.02) {
      presence.current = 0;
      loupe.visible = false;
      if (labelRef.current) labelRef.current.style.visibility = "hidden";
      return;
    }
    const appearing = !loupe.visible;

    const { buffer, point, up, look, hold, euler } = scratch;
    state.gl.getDrawingBufferSize(buffer);
    const width = buffer.x;
    const height = buffer.y;
    const px = captured ? 0 : state.pointer.x;
    const py = captured ? 0 : state.pointer.y;

    // Grows in when taken, shrinks away when put down.
    const grown = 1 - Math.pow(1 - presence.current, 3);
    const diameter = lensDiameter(width, height) * grown;

    // The lens sits on the line from the eye through the pointer, facing the eye.
    camera.updateMatrixWorld();
    const depth = camera.near * DEPTH_IN_NEARS;
    const halfHeight = (depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / camera.zoom;
    point.set(px * halfHeight * camera.aspect, py * halfHeight, -depth).applyMatrix4(camera.matrixWorld);
    loupe.position.copy(point);
    loupe.scale.setScalar(worldRadiusForPixels(diameter / 2, depth, camera.fov, height, camera.zoom) / MODEL_LENS.radius);

    // It leans after its own motion and settles back.
    const s = sway.current;
    if (appearing) {
      s.lastX = px;
      s.lastY = py;
    }
    const vx = (px - s.lastX) / Math.max(step, 1 / 240);
    const vy = (py - s.lastY) / Math.max(step, 1 / 240);
    s.lastX = px;
    s.lastY = py;
    s.x = THREE.MathUtils.damp(s.x, THREE.MathUtils.clamp(vx * 0.06, -0.3, 0.3), 7, step);
    s.y = THREE.MathUtils.damp(s.y, THREE.MathUtils.clamp(vy * 0.06, -0.3, 0.3), 7, step);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    look.lookAt(camera.position, point, up);
    loupe.quaternion.setFromRotationMatrix(look);
    euler.set(HOLD.tilt - s.y, HOLD.yaw + s.x, HOLD.roll - s.x * 0.5);
    loupe.quaternion.multiply(hold.setFromEuler(euler));
    loupe.updateMatrixWorld();

    // The magnified view: the same camera, cropped to a square `power` times smaller than the lens around it.
    const size = targetSize(lensDiameter(width, height));
    if (target.width !== size) target.setSize(size, size);
    const centerX = ((px + 1) / 2) * width;
    const centerY = ((1 - py) / 2) * height;
    const crop = lensViewOffset({ x: centerX, y: centerY }, diameter, power.current);
    viewCamera.copy(camera, false);
    viewCamera.setViewOffset(width, height, crop.x, crop.y, crop.width, crop.height);
    viewCamera.updateMatrixWorld();

    loupe.visible = false;
    const previous = state.gl.getRenderTarget();
    state.gl.setRenderTarget(target);
    state.gl.clear();
    state.gl.render(state.scene, viewCamera);
    state.gl.setRenderTarget(previous);
    loupe.visible = true;
    if (labelRef.current) labelRef.current.style.visibility = "visible";

    const uniforms = parts.lensMaterial.uniforms;
    uniforms.uCenter.value.set(centerX, height - centerY);
    uniforms.uRadius.value = diameter / 2;
  });

  return (
    <group ref={group} visible={false}>
      <group position={[0, -MODEL_LENS.center.y, 0]}>
        <mesh geometry={parts.frame} material={parts.frameMaterial} raycast={() => null} />
        <mesh geometry={parts.glass} material={parts.lensMaterial} raycast={() => null} />
        <Html position={[MODEL_LENS.radius * 0.95, MODEL_LENS.center.y + MODEL_LENS.radius * 0.95, 0]} style={{ pointerEvents: "none" }} zIndexRange={[4, 0]}>
          <div
            ref={labelRef}
            style={{
              opacity: label.shown && active ? 1 : 0,
              transition: "opacity 0.25s ease",
              padding: "2px 7px",
              borderRadius: 4,
              background: "rgba(7,6,10,0.62)",
              border: "1px solid rgba(214,178,110,0.35)",
              color: "#eadcbf",
              font: "12px var(--font-jetbrains), monospace",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            {label.text}
          </div>
        </Html>
      </group>
    </group>
  );
}
