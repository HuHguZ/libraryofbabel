"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mouseCaptureAvailable, setCenterAim } from "./cursor";

export interface GalleryControlsHandle {
  /** Smoothly turn the view to the given yaw (and optional pitch), radians. */
  lookAt(yaw: number, pitch?: number): void;
  /** Instantly move and orient the camera (position is the eye). */
  teleport(position: THREE.Vector3Like, yaw: number, pitch?: number): void;
  getYaw(): number;
  /** Current eye position (a copy). */
  getPosition(): THREE.Vector3;
  /** True while the mouse leads the view from the screen centre (captured or free-mouse mode). */
  isLocked(): boolean;
  /** Release the mouse (Esc does the same). */
  unlock(): void;
}

export interface GalleryControlsProps {
  ref?: Ref<GalleryControlsHandle>;
  /** Initial eye position. */
  initialPosition: [number, number, number];
  initialYaw: number;
  initialPitch?: number;
  /** Enable WASD / arrow-key / two-finger walking, jumping and gravity. */
  walk?: boolean;
  /**
   * Shooter-style mouse look: a click on the scene takes the mouse, Esc gives it back. The browser's
   * pointer lock is used when it is granted; otherwise the hidden cursor leads the view freely and the
   * edges of the canvas keep turning it. Mouse only.
   */
  pointerLock?: boolean;
  speed?: number;
  /** Camera height above the feet (walk mode). */
  eyeHeight?: number;
  /** Clamp yaw to this range (radians, absolute). Omit for free rotation. */
  yawRange?: [number, number];
  pitchRange?: [number, number];
  fovRange?: [number, number];
  initialFov?: number;
  /** Keeps the proposed feet position inside the walkable area and returns the floor height under it. */
  constrain?: (feet: THREE.Vector3, from: THREE.Vector3) => number | void;
  onFrame?: (yaw: number, position: THREE.Vector3) => void;
  onInteract?: () => void;
  /** The mouse was taken (true) or released (false). */
  onLockChange?: (locked: boolean) => void;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const GRAVITY = 13;
const JUMP_SPEED = 3.7;
const RUN_FACTOR = 1.85;
const LOOK_SENSITIVITY = 0.0021;
/** Free-mouse mode: share of the canvas width, at each side, where the view keeps turning. */
const EDGE_BAND = 0.14;
/** Free-mouse mode: turning speed (rad/s) with the cursor at the very edge. */
const EDGE_TURN_RATE = 2.4;
const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"];

/**
 * Whether the browser's pointer lock is known to work here. Embedded browsers (the preview pane of an
 * IDE, a sandboxed frame) refuse it silently; after the first refusal the free-mouse mode is used
 * right away, so no click is ever lost.
 */
let pointerLockWorked = false;
let pointerLockRefused = false;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * First-person controls.
 * Mouse: click to take the mouse and look around like in a shooter (Esc releases it); before that,
 * drag to look. Touch: one finger looks, two fingers walk. Keys: W A S D / arrows walk, Shift runs,
 * Space jumps. Wheel zooms.
 */
export default function GalleryControls({
  ref,
  initialPosition,
  initialYaw,
  initialPitch = 0,
  walk = false,
  pointerLock = false,
  speed = 2.2,
  eyeHeight = 1.6,
  yawRange,
  pitchRange = [-1.15, 1.15],
  fovRange = [34, 72],
  initialFov = 58,
  constrain,
  onFrame,
  onInteract,
  onLockChange,
}: GalleryControlsProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const events = useThree((s) => s.events);

  const eye = walk ? eyeHeight : 0;
  const state = useRef({
    yaw: initialYaw,
    pitch: initialPitch,
    targetYaw: initialYaw,
    targetPitch: initialPitch,
    fov: initialFov,
    targetFov: initialFov,
    /** Feet position (eye position in non-walk mode). */
    feet: new THREE.Vector3(initialPosition[0], initialPosition[1] - eye, initialPosition[2]),
    from: new THREE.Vector3(initialPosition[0], initialPosition[1] - eye, initialPosition[2]),
    smooth: new THREE.Vector3(initialPosition[0], initialPosition[1] - eye, initialPosition[2]),
    vy: 0,
    grounded: true,
    keys: new Set<string>(),
    pointers: new Map<number, { x: number; y: number }>(),
    lastCentroidY: 0,
    lastPointerType: "mouse",
    interacted: false,
    walkImpulse: 0,
    /** The browser has locked the pointer to the canvas. */
    locked: false,
    /** Free-mouse mode: the hidden cursor leads the view without a lock. */
    free: false,
    freeX: NaN,
    freeY: NaN,
    /** -1..1: how deep the free cursor is in the left / right edge band. */
    edgeTurn: 0,
    moving: false,
    bobPhase: 0,
    bobAmount: 0,
    lastCamera: new THREE.Vector3(NaN, NaN, NaN),
    lastYaw: NaN,
    lastPitch: NaN,
  });

  // Keep the latest callbacks and ranges without re-binding listeners: re-binding would release a
  // captured mouse every time the parent re-renders.
  const callbacks = useRef({ constrain, onFrame, onInteract, onLockChange });
  const ranges = useRef({ yawRange, pitchRange, fovRange });
  useLayoutEffect(() => {
    callbacks.current = { constrain, onFrame, onInteract, onLockChange };
    ranges.current = { yawRange, pitchRange, fovRange };
  });

  useImperativeHandle(
    ref,
    () => ({
      lookAt(yaw, pitch) {
        const s = state.current;
        s.targetYaw = s.yaw + wrapAngle(yaw - s.yaw);
        if (pitch !== undefined) s.targetPitch = pitch;
      },
      teleport(position, yaw, pitch) {
        const s = state.current;
        s.feet.set(position.x, position.y - eye, position.z);
        s.from.copy(s.feet);
        s.smooth.copy(s.feet);
        s.vy = 0;
        s.grounded = true;
        s.yaw = s.targetYaw = yaw;
        if (pitch !== undefined) s.pitch = s.targetPitch = pitch;
      },
      getYaw() {
        return state.current.yaw;
      },
      getPosition() {
        return camera.position.clone();
      },
      isLocked() {
        return state.current.locked || state.current.free;
      },
      unlock() {
        if (typeof document !== "undefined" && document.pointerLockElement) document.exitPointerLock();
        if (state.current.free) {
          state.current.free = false;
          state.current.edgeTurn = 0;
          setCenterAim(gl.domElement, false);
          callbacks.current.onLockChange?.(false);
        }
      },
    }),
    [eye, camera, gl]
  );

  // Initial camera placement.
  useEffect(() => {
    const s = state.current;
    camera.rotation.order = "YXZ";
    camera.position.set(s.smooth.x, s.smooth.y + eye, s.smooth.z);
    camera.rotation.set(s.pitch, s.yaw, 0);
    camera.fov = s.fov;
    camera.near = 0.05;
    camera.far = 80;
    camera.updateProjectionMatrix();
  }, [camera, eye]);

  useEffect(() => {
    const el = gl.domElement;
    const s = state.current;
    const capturable = walk && pointerLock && mouseCaptureAvailable();
    const markInteraction = () => {
      if (!s.interacted) {
        s.interacted = true;
        callbacks.current.onInteract?.();
      }
    };
    const turn = (dx: number, dy: number, sens: number) => {
      const { yawRange: yr, pitchRange: pr } = ranges.current;
      s.targetYaw += dx * sens;
      s.targetPitch = THREE.MathUtils.clamp(s.targetPitch + dy * sens, pr[0], pr[1]);
      if (yr) s.targetYaw = THREE.MathUtils.clamp(s.targetYaw, yr[0], yr[1]);
    };

    /* ── Taking and releasing the mouse ── */
    const enterFree = () => {
      if (s.free || s.locked) return;
      s.free = true;
      s.freeX = NaN;
      s.freeY = NaN;
      s.edgeTurn = 0;
      s.pointers.clear();
      setCenterAim(el, true);
      callbacks.current.onLockChange?.(true);
      events.update?.();
    };
    const exitFree = () => {
      if (!s.free) return;
      s.free = false;
      s.edgeTurn = 0;
      s.keys.clear();
      setCenterAim(el, false);
      callbacks.current.onLockChange?.(false);
    };
    const lockRefused = () => {
      // A lock that once worked fails only for a moment (the browser's cool-down after Esc); a lock
      // that never worked is not going to: fall back to the free mouse.
      if (pointerLockWorked) return;
      pointerLockRefused = true;
      enterFree();
    };
    const takeMouse = () => {
      if (pointerLockRefused || typeof el.requestPointerLock !== "function") {
        enterFree();
        return;
      }
      try {
        const result = (el.requestPointerLock as () => Promise<void> | undefined).call(el);
        result?.catch?.(lockRefused);
      } catch {
        lockRefused();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      s.lastPointerType = e.pointerType;
      if (s.locked || s.free) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (s.pointers.size === 2) {
        let cy = 0;
        s.pointers.forEach((p) => (cy += p.y));
        s.lastCentroidY = cy / 2;
      }
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (s.locked) {
        // Captured mouse: raw movement, shooter semantics (mouse right = look right).
        const dx = THREE.MathUtils.clamp(e.movementX, -120, 120);
        const dy = THREE.MathUtils.clamp(e.movementY, -120, 120);
        if (dx || dy) {
          markInteraction();
          turn(-dx, -dy, LOOK_SENSITIVITY);
        }
        return;
      }
      if (s.free) {
        if (e.pointerType !== "mouse") return;
        // Free mouse: the hidden cursor's movement turns the view; near the sides it keeps turning,
        // so the view is not stuck once the cursor reaches the edge of the screen.
        if (Number.isFinite(s.freeX)) {
          const dx = THREE.MathUtils.clamp(e.clientX - s.freeX, -120, 120);
          const dy = THREE.MathUtils.clamp(e.clientY - s.freeY, -120, 120);
          if (dx || dy) {
            markInteraction();
            turn(-dx, -dy, LOOK_SENSITIVITY);
          }
        }
        s.freeX = e.clientX;
        s.freeY = e.clientY;
        const rect = el.getBoundingClientRect();
        const u = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
        s.edgeTurn = u < EDGE_BAND ? -((EDGE_BAND - u) / EDGE_BAND) : u > 1 - EDGE_BAND ? (u - (1 - EDGE_BAND)) / EDGE_BAND : 0;
        return;
      }
      const prev = s.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (Math.abs(dx) + Math.abs(dy) > 1) markInteraction();

      if (s.pointers.size >= 2) {
        // Two fingers: walk forward / back.
        let cy = 0;
        s.pointers.forEach((p) => (cy += p.y));
        cy /= s.pointers.size;
        const delta = cy - s.lastCentroidY;
        s.lastCentroidY = cy;
        if (walk) s.walkImpulse -= delta * 0.012;
        return;
      }
      // "Grab the world": dragging right turns the view left, as in street-level panoramas.
      turn(dx, dy, e.pointerType === "touch" ? 0.0042 : 0.0028);
    };
    const onPointerLeave = () => {
      s.freeX = NaN;
      s.freeY = NaN;
      s.edgeTurn = 0;
    };
    const onPointerUp = (e: PointerEvent) => {
      s.pointers.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!capturable || s.locked || s.free || s.lastPointerType !== "mouse") return;
      // The first click only takes the mouse; the scene must not treat it as a click on a book.
      e.stopImmediatePropagation();
      markInteraction();
      takeMouse();
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement === el;
      if (locked === s.locked) return;
      if (locked) {
        pointerLockWorked = true;
        if (s.free) {
          s.free = false;
          s.edgeTurn = 0;
          setCenterAim(el, false);
        }
      }
      s.locked = locked;
      s.pointers.clear();
      if (!locked) s.keys.clear();
      callbacks.current.onLockChange?.(locked);
    };
    const onLockError = () => lockRefused();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      markInteraction();
      const fr = ranges.current.fovRange;
      s.targetFov = THREE.MathUtils.clamp(s.targetFov + e.deltaY * 0.02, fr[0], fr[1]);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.code === "Escape" || e.key === "Escape") && s.free) {
        exitFree();
        return;
      }
      if (!walk || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!MOVE_KEYS.includes(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      s.keys.add(e.code);
      markInteraction();
      if (e.code === "Space" && s.grounded) {
        s.grounded = false;
        s.vy = JUMP_SPEED;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => s.keys.delete(e.code);
    const onBlur = () => {
      s.keys.clear();
      exitFree();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", onLockError);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockError);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (document.pointerLockElement === el) document.exitPointerLock();
      if (s.free) {
        s.free = false;
        s.edgeTurn = 0;
        setCenterAim(el, false);
      }
    };
  }, [gl, events, walk, pointerLock]);

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const s = state.current;
    const step = Math.min(dt, 0.05);
    let running = false;

    if (walk) {
      const k = s.keys;
      running = k.has("ShiftLeft") || k.has("ShiftRight");
      const f = forward.current.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
      const r = right.current.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
      const m = move.current.set(0, 0, 0);
      if (k.has("KeyW") || k.has("ArrowUp")) m.add(f);
      if (k.has("KeyS") || k.has("ArrowDown")) m.sub(f);
      if (k.has("KeyD") || k.has("ArrowRight")) m.add(r);
      if (k.has("KeyA") || k.has("ArrowLeft")) m.sub(r);
      if (m.lengthSq() > 0) m.normalize().multiplyScalar(speed * (running ? RUN_FACTOR : 1) * step);
      if (Math.abs(s.walkImpulse) > 1e-4) {
        m.addScaledVector(f, s.walkImpulse);
        s.walkImpulse *= 0.6;
      }
      const moving = m.lengthSq() > 0;
      if (moving || !s.grounded) {
        s.from.copy(s.feet);
        s.feet.x += m.x;
        s.feet.z += m.z;
        if (!s.grounded) {
          s.vy -= GRAVITY * step;
          s.feet.y += s.vy * step;
        }
        const ground = callbacks.current.constrain?.(s.feet, s.from) ?? 0;
        if (s.grounded) {
          if (ground < s.feet.y - 0.5) {
            s.grounded = false;
            s.vy = 0;
          } else {
            s.feet.y = ground;
          }
        } else if (s.feet.y <= ground) {
          s.feet.y = ground;
          s.vy = 0;
          s.grounded = true;
        }
      }
      s.moving = moving && s.grounded;
    }

    // Free mouse parked near a side of the canvas: keep turning that way.
    if (s.free && s.edgeTurn !== 0) {
      const t = s.edgeTurn;
      const yr = ranges.current.yawRange;
      s.targetYaw -= Math.sign(t) * t * t * EDGE_TURN_RATE * step;
      if (yr) s.targetYaw = THREE.MathUtils.clamp(s.targetYaw, yr[0], yr[1]);
    }

    const aimed = s.locked || s.free;
    s.yaw = THREE.MathUtils.damp(s.yaw, s.targetYaw, aimed ? 22 : 9, step);
    s.pitch = THREE.MathUtils.damp(s.pitch, s.targetPitch, aimed ? 22 : 9, step);
    s.fov = THREE.MathUtils.damp(s.fov, s.targetFov, 7, step);
    s.smooth.x = THREE.MathUtils.damp(s.smooth.x, s.feet.x, 8, step);
    s.smooth.z = THREE.MathUtils.damp(s.smooth.z, s.feet.z, 8, step);
    // Steps are smoothed out; a jump follows the feet exactly.
    s.smooth.y = walk && !s.grounded ? s.feet.y : THREE.MathUtils.damp(s.smooth.y, s.feet.y, 10, step);

    // A little head bob while walking.
    s.bobAmount = THREE.MathUtils.damp(s.bobAmount, s.moving ? 1 : 0, 8, step);
    if (s.moving) s.bobPhase += step * (running ? 12 : 9);
    const bob = Math.sin(s.bobPhase) * 0.016 * s.bobAmount;

    camera.position.set(s.smooth.x, s.smooth.y + eye + bob, s.smooth.z);
    camera.rotation.set(s.pitch, s.yaw, 0);
    if (Math.abs(camera.fov - s.fov) > 1e-3) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }

    // With the mouse taken, the cursor is the screen centre: refresh hover when the view changes.
    if (aimed) {
      const changed =
        s.lastCamera.distanceToSquared(camera.position) > 1e-7 || Math.abs(s.lastYaw - s.yaw) > 1e-5 || Math.abs(s.lastPitch - s.pitch) > 1e-5;
      if (changed || Number.isNaN(s.lastYaw)) events.update?.();
    }
    s.lastCamera.copy(camera.position);
    s.lastYaw = s.yaw;
    s.lastPitch = s.pitch;

    callbacks.current.onFrame?.(s.yaw, camera.position);
  });

  return null;
}
