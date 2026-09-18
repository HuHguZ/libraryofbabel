import type * as THREE from "three";

/** Where the camera is, what it looks at, and its lens. */
export interface CameraShot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  near: number;
}

/** Pose of a closed book's centre in the world; `scale` is the correction in book axes (1 on the desk). */
export interface BookPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

/** A visitor's eye and view angles, as GalleryControls keeps them (rotation order "YXZ"). */
export interface WalkPose {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
}

const TURN = Math.PI * 2;

/**
 * The same yaw, and the range around it, moved by whole turns to lie nearest the camera's `current` yaw.
 * GalleryControls never wraps its yaw and clamps it against an absolute range, while gallery B's yaws run
 * up to 2π: a range a turn away from the camera would swing the view round at the first touch.
 */
export function nearestYaw(current: number, yaw: number, range?: [number, number]): { yaw: number; range?: [number, number] } {
  const shift = Math.round((current - yaw) / TURN) * TURN;
  return range ? { yaw: yaw + shift, range: [range[0] + shift, range[1] + shift] } : { yaw: yaw + shift };
}
