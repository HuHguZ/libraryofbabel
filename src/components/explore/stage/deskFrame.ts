import * as THREE from "three";
import { ROOM, closeupForSide, facingCenterRotation, galleryCenter, galleryRotation, sideAngle, sideYaw, type GallerySide } from "../geometry";
import { CASE, planBookcase, shelfPlankY } from "../bookcasePlan";
import { CLOSED_CENTER, CLOSED_THICKNESS, COVER, HOME_POSITION, HOME_TARGET, READER_FOV, READER_NEAR } from "./bookSpace";
import type { BookPose, CameraShot, WalkPose } from "./poses";

/** The board of a reading desk (metres); `top` is the height of its surface above the floor. */
export const DESK = { width: 0.8, depth: 0.4, top: 0.97, board: 0.035 } as const;
/** Distance from the centre of a gallery to the middle of a railing segment. */
export const RAIL_APOTHEM = ROOM.railRadius * Math.cos(Math.PI / 6);
/** Book space → metres: the cover's 2.14 become 0.321 m, the height of a volume on its shelf. */
export const BOOK_SCALE = 0.15;
/** Near plane while walking or at a shelf; at the desk it is the reader's own, scaled with the book. */
export const WALK_NEAR = 0.05;

/** Where the reader's book space lies in the world: world = position + R_y(yaw) · (scale · p). */
export interface DeskFrame {
  position: THREE.Vector3;
  yaw: number;
  scale: number;
}

/** The globe of a desk lamp, in metres along the desk's book-space axes from the centre of its top: at the reader's right, towards the far edge. */
const LAMP_ON_DESK = new THREE.Vector3(0.33, 0.3, -0.12);
/** Where a visitor stands at a desk, from the centre of the gallery. */
const VISITOR_RADIUS = 1.9;
/** The watch shot, in metres from the centre of a desk's top: how far back over the shaft the eye hangs and how high, and where it looks. */
const WATCH = { back: 1.8, up: 0.6, look: 0.2, lookUp: 0.65 } as const;
/** The shelf close-up: how far the eye stays from the books, and how far it may look aside. */
const CLOSEUP_DISTANCE = 2.6;
const CLOSEUP_YAW = 0.55;
/** Where GalleryRoom stands a bookcase: against its wall, a little off it. */
export const BOOKCASE_RADIUS = ROOM.apothem - 0.012;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Book space → bookcase space for a volume on its shelf: spine to the room, head up. */
const ON_SHELF = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0))
);
const scratch = { scale: new THREE.Vector3(), origin: new THREE.Vector3() };

/** Unit vector (gallery-local, horizontal) from the centre of a gallery towards wall 1..5. */
function towardsWall(wall: number): { x: number; z: number } {
  const a = sideAngle(wall - 1);
  return { x: Math.cos(a), z: Math.sin(a) };
}

/** Yaw of the book space of the desk facing wall 1..5 in an unturned gallery: book +z points at the wall. */
function deskYaw(wall: number): number {
  const u = towardsWall(wall);
  return Math.atan2(u.x, u.z);
}

/** Turns v about y the way rotation.y does (local +z goes to (sin, 0, cos)); `out` may be v. */
function turnY(v: THREE.Vector3Like, angle: number, out: THREE.Vector3): THREE.Vector3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const { x, y, z } = v;
  return out.set(x * cos + z * sin, y, z * cos - x * sin);
}

/** Centre of the top of the desk that faces wall 1..5 across the shaft, gallery-local (floor at y = 0). */
export function deskCenterLocal(wall: number): THREE.Vector3 {
  const u = towardsWall(wall);
  const r = RAIL_APOTHEM + DESK.depth / 2;
  return new THREE.Vector3(u.x * r, DESK.top, u.z * r);
}

/** The four corners of that desk top, gallery-local. */
export function deskCorners(wall: number): THREE.Vector3[] {
  const u = towardsWall(wall);
  const c = deskCenterLocal(wall);
  const corners: THREE.Vector3[] = [];
  for (const along of [-DESK.depth / 2, DESK.depth / 2]) {
    for (const across of [-DESK.width / 2, DESK.width / 2]) {
      // Across the desk: t = (-u.z, 0, u.x).
      corners.push(new THREE.Vector3(c.x + u.x * along - u.z * across, c.y, c.z + u.z * along + u.x * across));
    }
  }
  return corners;
}

/** The globe of the lamp on that desk, gallery-local. */
export function deskLampLocal(wall: number): THREE.Vector3 {
  return turnY(LAMP_ON_DESK, deskYaw(wall), new THREE.Vector3()).add(deskCenterLocal(wall));
}

/** How far a gallery is turned: a gallery-local yaw plus this is a world yaw. */
export function galleryYaw(side: GallerySide): number {
  return galleryRotation(side);
}

/** A gallery-local point of the gallery at (level, side), in the world. */
export function galleryToWorld(level: number, side: GallerySide, p: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 {
  const [cx, cy, cz] = galleryCenter(side, level);
  turnY(p, galleryYaw(side), out);
  return out.set(out.x + cx, out.y + cy, out.z + cz);
}

/** The book space of the desk facing wall 1..5 in the gallery at (level, side): book +z points at the wall. */
export function deskFrame(level: number, side: GallerySide, wall: number): DeskFrame {
  return {
    position: galleryToWorld(level, side, deskCenterLocal(wall)),
    yaw: deskYaw(wall) + galleryYaw(side),
    scale: BOOK_SCALE,
  };
}

/** A point of book space in the world; `out` may be `p`. */
export function bookToWorld(frame: DeskFrame, p: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 {
  out.set(p.x, p.y, p.z).multiplyScalar(frame.scale);
  return turnY(out, frame.yaw, out).add(frame.position);
}

/** A world point in book space; `out` may be `p`. */
export function worldToBook(frame: DeskFrame, p: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 {
  out.set(p.x, p.y, p.z).sub(frame.position);
  return turnY(out, -frame.yaw, out).divideScalar(frame.scale);
}

/** A direction of book space in the world: turned only, its length kept. */
export function bookDirToWorld(frame: DeskFrame, d: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 {
  return turnY(d, frame.yaw, out);
}

/** The reader's starting view of the whole book, over the desk. */
export function readerHomeShot(frame: DeskFrame): CameraShot {
  return {
    position: bookToWorld(frame, HOME_POSITION),
    target: bookToWorld(frame, HOME_TARGET),
    fov: READER_FOV,
    near: READER_NEAR * frame.scale,
  };
}

/**
 * The desk with the whole of its wall of shelves behind it, from a step back over the shaft at a standing visitor's
 * height and lens. A book's flight home fits in it end to end, which the reader's own shot — a hand's breadth over
 * the open book — is far too close for.
 */
export function deskWatchShot(frame: DeskFrame, fov: number): CameraShot {
  return {
    position: bookDirToWorld(frame, { x: 0, y: WATCH.up, z: -WATCH.back }).add(frame.position),
    target: bookDirToWorld(frame, { x: 0, y: WATCH.lookUp, z: WATCH.look }).add(frame.position),
    fov,
    near: WALK_NEAR,
  };
}

/** A visitor standing at the desk of wall 1..5, between it and the shelves, looking at them. */
export function visitorAtDesk(level: number, side: GallerySide, wall: number): WalkPose {
  const u = towardsWall(wall);
  const eye = new THREE.Vector3(u.x * VISITOR_RADIUS, ROOM.eyeHeight, u.z * VISITOR_RADIUS);
  return { position: galleryToWorld(level, side, eye, eye), yaw: sideYaw(wall - 1) + galleryYaw(side), pitch: -0.04 };
}

/** The camera of a visitor: looking along yaw and pitch (rotation order "YXZ"), a metre ahead. */
export function walkShot(pose: WalkPose, fov: number): CameraShot {
  const { position, yaw, pitch } = pose;
  const ahead = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  return { position: position.clone(), target: ahead.add(position), fov, near: WALK_NEAR };
}

/** The close-up of a shelf, hanging over the shaft: the eye as high as its volumes (within 1.05..2.45 m), facing the wall. */
export function closeupPose(level: number, side: GallerySide, wall: number, shelf: number): { pose: WalkPose; yawRange: [number, number] } {
  const bookY = shelfPlankY(shelf) + CASE.shelfThickness / 2 + CASE.bookH / 2;
  const eye = THREE.MathUtils.clamp(bookY, 1.05, 2.45);
  const [x, , z] = closeupForSide(wall - 1, CLOSEUP_DISTANCE);
  const yaw = sideYaw(wall - 1) + galleryYaw(side);
  return {
    pose: { position: galleryToWorld(level, side, { x, y: eye, z }), yaw, pitch: Math.atan2(bookY - eye, CLOSEUP_DISTANCE) },
    yawRange: [yaw - CLOSEUP_YAW, yaw + CLOSEUP_YAW],
  };
}

/**
 * A closed book standing in the place of a volume on its shelf. The volume is thicker and deeper than
 * the closed desk book, so the pose carries a correction scale that makes the book fill its box.
 */
export function shelfBookPose(level: number, side: GallerySide, wall: number, shelf: number, volume: number, seed: number): BookPose {
  const { x, y, z, scaleY } = planBookcase(seed, wall).placements.find((b) => b.shelf === shelf && b.volume === volume)!;
  const u = towardsWall(wall);
  const caseYaw = facingCenterRotation(sideAngle(wall - 1));
  // The centre of the closed book is the centre of the volume's box: bookcase → gallery → world.
  const center = turnY({ x, y, z }, caseYaw, new THREE.Vector3());
  center.x += u.x * BOOKCASE_RADIUS;
  center.z += u.z * BOOKCASE_RADIUS;
  return {
    position: galleryToWorld(level, side, center, center),
    quaternion: new THREE.Quaternion().setFromAxisAngle(Y_AXIS, galleryYaw(side) + caseYaw).multiply(ON_SHELF),
    scale: new THREE.Vector3(
      CASE.bookD / ((COVER.w / 2) * BOOK_SCALE),
      CASE.bookW / (CLOSED_THICKNESS * BOOK_SCALE),
      (CASE.bookH * scaleY) / (COVER.d * BOOK_SCALE)
    ),
  };
}

/** A closed book lying on the desk, turned and placed as the frame's book space (no correction). */
export function deskBookPose(frame: DeskFrame): BookPose {
  return {
    position: bookToWorld(frame, CLOSED_CENTER),
    quaternion: new THREE.Quaternion().setFromAxisAngle(Y_AXIS, frame.yaw),
    scale: new THREE.Vector3(1, 1, 1),
  };
}

/** Book space → world for a closed book at `pose`: T(position) · R(quaternion) · S(BOOK_SCALE) · S(scale) · T(−CLOSED_CENTER). */
export function bookMatrix(pose: BookPose, out = new THREE.Matrix4()): THREE.Matrix4 {
  const scale = scratch.scale.copy(pose.scale).multiplyScalar(BOOK_SCALE);
  const origin = scratch.origin.copy(CLOSED_CENTER).multiply(scale).applyQuaternion(pose.quaternion);
  return out.compose(origin.subVectors(pose.position, origin), pose.quaternion, scale);
}
