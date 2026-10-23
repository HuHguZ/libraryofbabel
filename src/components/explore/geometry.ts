import * as THREE from "three";

/** The hexagonal gallery, in metres. Sides 0, 1, 3, 4 carry shelves (walls 1..4); sides 2 and 5 are doorways. */
export const ROOM = {
  radius: 4,
  apothem: 4 * Math.cos(Math.PI / 6),
  height: 3.4,
  /** Thickness of the floor between two galleries. */
  slab: 0.3,
  /** Floor-to-floor distance: the world repeats vertically with this period. */
  level: 3.7,
  shaftRadius: 1.1,
  railRadius: 1.22,
  railHeight: 0.95,
  doorWidth: 1.5,
  doorHeight: 2.5,
  vestibuleWidth: 2.6,
  vestibuleDepth: 2.8,
  eyeHeight: 1.6,
  levelsBelow: 6,
  levelsAbove: 4,
} as const;

/** The doorways: side 5 leads east to the next gallery of the row, side 2 west to the one before. */
export const EAST_DOOR = 5;
export const WEST_DOOR = 2;
export const DOOR_SIDES = [WEST_DOOR, EAST_DOOR] as const;
/** Side of each wall of shelves: wall n (1..4) stands on side WALL_SIDES[n − 1]. */
export const WALL_SIDES = [0, 1, 3, 4] as const;

export const wallSide = (wall: number): number => WALL_SIDES[wall - 1];

/** Wall (1..4) standing on side 0..5, 0 for a doorway. */
export const sideWall = (side: number): number => (WALL_SIDES as readonly number[]).indexOf(side) + 1;

const STEPS_PER_LEVEL = 16;

/**
 * The spiral staircase of the vestibule (vestibule-local: x lateral, z = -depth).
 * One full turn per level, so the stair of every gallery continues the one below it.
 */
export const STAIR = {
  x: -0.56,
  z: -1.55,
  /** Radius of the hole in the floor. */
  wellRadius: 0.66,
  poleRadius: 0.06,
  steps: STEPS_PER_LEVEL,
  rise: ROOM.level / STEPS_PER_LEVEL,
  /** Angle covered by one step. */
  arc: (Math.PI * 2) / STEPS_PER_LEVEL,
  /** Sector (around the pole, 0 = towards +x) where the stair meets the floor; the well guard covers the rest. */
  entryFrom: (-2 * Math.PI * 2) / STEPS_PER_LEVEL,
  entryTo: (Math.PI * 2) / STEPS_PER_LEVEL,
} as const;

/** Direction (radians, in the XZ plane) of side i, measured from +X towards +Z. */
export const sideAngle = (i: number) => (i * Math.PI) / 3 + Math.PI / 6;

/**
 * The galleries of a floor stand in a row, door to door, a vestibule (closets, mirror, spiral stair) between each one
 * and the next; the rows repeat on every floor. `col` counts galleries along the row from the world's own, east +1.
 */
export const ROW = {
  /** Distance between the centres of two neighbouring galleries. */
  period: 2 * ROOM.apothem + ROOM.vestibuleDepth,
  /** Unit vector from the centre of a gallery through its east doorway. */
  nx: Math.cos(sideAngle(EAST_DOOR)),
  nz: Math.sin(sideAngle(EAST_DOOR)),
  /** Lateral unit vector across the doorways. */
  tx: -Math.sin(sideAngle(EAST_DOOR)),
  tz: Math.cos(sideAngle(EAST_DOOR)),
} as const;

export interface WorldCell {
  level: number;
  col: number;
  /** True in the vestibule east of gallery `col`. */
  vestibule: boolean;
}

/** World position of the centre of a gallery. Every gallery faces the same way. */
export function galleryCenter(col: number, level: number): [number, number, number] {
  return [ROW.nx * ROW.period * col, level * ROOM.level, ROW.nz * ROW.period * col];
}

/** Distance along the row from the west doorway of gallery 0. */
const rowDistance = (p: THREE.Vector3Like) => p.x * ROW.nx + p.z * ROW.nz + ROOM.apothem;

/** Which gallery (or the vestibule east of it) a feet position is in. Levels switch while the eyes pass through the slab. */
export function cellAt(feet: THREE.Vector3Like): WorldCell {
  const s = rowDistance(feet);
  const col = Math.floor(s / ROW.period);
  return { level: Math.round(feet.y / ROOM.level), col, vestibule: s - col * ROW.period > 2 * ROOM.apothem };
}

/**
 * Level of a walker with hysteresis: switches only once the feet are a good step past the middle of
 * the floor slab, so standing at the edge of a tread never flickers between two levels.
 */
export function trackLevel(feetY: number, current: number): number {
  const margin = 0.15;
  let level = current;
  while (feetY > (level + 0.5) * ROOM.level + margin) level++;
  while (feetY < (level - 0.5) * ROOM.level - margin) level--;
  return level;
}

/** rotation.y for an object standing on side i whose local +z must point at the room centre. */
export function facingCenterRotation(angle: number): number {
  return Math.atan2(-Math.cos(angle), -Math.sin(angle));
}

/** Camera yaw (rotation.y, YXZ order) that looks along direction (dx, dz). */
export function yawTowards(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Camera yaw that looks straight at side i from anywhere on the opposite half of the room. */
export function sideYaw(i: number): number {
  const a = sideAngle(i);
  return yawTowards(Math.cos(a), Math.sin(a));
}

/** Which side (0..5) the camera is facing for a given yaw (of an unrotated gallery). */
export function facingSide(yaw: number): number {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const phi = Math.atan2(fz, fx);
  const i = Math.round((phi - Math.PI / 6) / (Math.PI / 3));
  return ((i % 6) + 6) % 6;
}

/** A spot across the shaft from side i, from where the whole wall of shelves is visible. */
export function viewpointForSide(i: number, distanceFromCenter = 1.75): [number, number, number] {
  const a = sideAngle(i);
  return [-Math.cos(a) * distanceFromCenter, ROOM.eyeHeight, -Math.sin(a) * distanceFromCenter];
}

/** A spot close to side i, for reading spines. */
export function closeupForSide(i: number, distanceFromWall = 2.6): [number, number, number] {
  const a = sideAngle(i);
  const r = ROOM.apothem - 0.32 - distanceFromWall;
  return [Math.cos(a) * r, ROOM.eyeHeight, Math.sin(a) * r];
}

export function hexagonShape(radius: number, holeRadius = 0): THREE.Shape {
  const shape = new THREE.Shape();
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const x = radius * Math.cos(a);
    const y = radius * Math.sin(a);
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  if (holeRadius > 0) {
    const hole = new THREE.Path();
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      const x = holeRadius * Math.cos(a);
      const y = holeRadius * Math.sin(a);
      if (k === 0) hole.moveTo(x, y);
      else hole.lineTo(x, y);
    }
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}

/**
 * Height of the stair tread at angle phi around the pole (radians, from local +x towards local +z),
 * on the turn of the spiral nearest to the current feet height y.
 * Tread i covers [i*arc, (i+1)*arc) and stands (i+1) risers above the floor, so the floor itself
 * is the landing over [-arc, 0) and tread 15 is flush with the floor above.
 */
export function stairHeightAt(phi: number, y: number): number {
  const base = (Math.floor(phi / STAIR.arc) + 1) * STAIR.rise;
  const turn = Math.round((y - base) / ROOM.level);
  return base + turn * ROOM.level;
}

/** Smooth version used for the handrail: height of the ramp through the tread centres. */
export function stairRampHeight(phi: number): number {
  return (phi / STAIR.arc + 0.5) * STAIR.rise;
}

const WALK_INSET = 0.45;
const LANE_HALF = 0.55;
const VESTIBULE_HALF = ROOM.vestibuleWidth / 2 - 0.3;
/** The tallest step a walker takes without jumping. */
const STEP_TOLERANCE = 0.34;
const WALKER_RADIUS = 0.14;

const scratch = { x: 0, z: 0 };

/** Keeps a point inside the room of an (unrotated) gallery centred at the origin, off the shaft. */
function clampRoom(p: { x: number; z: number }, lateral: number) {
  for (let i = 0; i < 6; i++) {
    if ((i === EAST_DOOR || i === WEST_DOOR) && Math.abs(lateral) < LANE_HALF) continue;
    const a = sideAngle(i);
    const wx = Math.cos(a);
    const wz = Math.sin(a);
    const dist = p.x * wx + p.z * wz;
    const limit = ROOM.apothem - WALK_INSET;
    if (dist > limit) {
      p.x -= wx * (dist - limit);
      p.z -= wz * (dist - limit);
    }
  }
  const r = Math.hypot(p.x, p.z);
  const minR = ROOM.railRadius + 0.32;
  if (r < minR) {
    if (r < 1e-4) {
      p.x = minR;
      p.z = 0;
    } else {
      p.x *= minR / r;
      p.z *= minR / r;
    }
  }
}

/**
 * Keeps a walker inside the galleries of the rows, the vestibules between them and on their spiral staircases, on any
 * level. feet is the proposed feet position (mutated in place), from the last accepted one. Returns the height of the
 * floor or tread under the feet.
 */
export function constrainWalk(feet: THREE.Vector3, from: THREE.Vector3): number {
  const { nx, nz, tx, tz, period } = ROW;
  const depth = ROOM.vestibuleDepth;
  const levelFloor = Math.round(feet.y / ROOM.level) * ROOM.level;
  const col = Math.floor(rowDistance(feet) / period);
  const cx = nx * period * col;
  const cz = nz * period * col;
  // Corridor coordinates of the vestibule east of `col`: t is the depth beyond its doorway, l the lateral offset.
  const corridor = (p: THREE.Vector3Like) => rowDistance(p) - col * period - 2 * ROOM.apothem;
  let t = corridor(feet);
  let l = feet.x * tx + feet.z * tz;

  if (t < -0.1) {
    scratch.x = feet.x - cx;
    scratch.z = feet.z - cz;
    clampRoom(scratch, l);
    feet.x = cx + scratch.x;
    feet.z = cz + scratch.z;
    return levelFloor;
  }

  // The vestibule, up to the west doorway of the next gallery.
  const nearDoor = t < 0.25 || t > depth - 0.25;
  const maxL = nearDoor ? LANE_HALF : VESTIBULE_HALF;
  l = THREE.MathUtils.clamp(l, -maxL, maxL);

  // The stair well (vestibule-local z = -t, so the well is at depth -STAIR.z).
  const wellT = -STAIR.z;
  const dl = l - STAIR.x;
  const dt = t - wellT;
  const dist = Math.hypot(dl, dt);
  const phi = Math.atan2(-dt, dl);
  const fromT = corridor(from);
  const fromL = from.x * tx + from.z * tz;
  const wasInWell = Math.hypot(fromL - STAIR.x, fromT - wellT) < STAIR.wellRadius;
  const inWell = dist < STAIR.wellRadius;
  let ground = levelFloor;

  if (inWell) {
    const tread = stairHeightAt(phi, feet.y);
    const blocked = !wasInWell && (phi < STAIR.entryFrom || phi > STAIR.entryTo || Math.abs(tread - from.y) > STEP_TOLERANCE);
    if (blocked) {
      // The well guard: slide along the rim instead of stepping into the void.
      const r = STAIR.wellRadius + 0.02;
      l = STAIR.x + Math.cos(phi) * r;
      t = wellT - Math.sin(phi) * r;
    } else {
      const minR = STAIR.poleRadius + WALKER_RADIUS;
      if (dist < minR) {
        l = STAIR.x + Math.cos(phi) * minR;
        t = wellT - Math.sin(phi) * minR;
      }
      ground = tread;
    }
  } else if (wasInWell && Math.abs(levelFloor - from.y) > STEP_TOLERANCE) {
    // Leaving the stair anywhere but at a landing: the handrail keeps the walker on the treads.
    const r = STAIR.wellRadius - 0.02;
    l = STAIR.x + Math.cos(phi) * r;
    t = wellT - Math.sin(phi) * r;
    ground = stairHeightAt(phi, feet.y);
  }

  feet.x = cx + nx * (ROOM.apothem + t) + tx * l;
  feet.z = cz + nz * (ROOM.apothem + t) + tz * l;
  return ground;
}

/** Position (world) and rotation.y of the vestibule east of gallery `col` on a level. */
export function vestibuleFrame(col: number, level: number): { position: [number, number, number]; rotation: number } {
  const a = sideAngle(EAST_DOOR);
  const [cx, cy, cz] = galleryCenter(col, level);
  return { position: [cx + Math.cos(a) * ROOM.apothem, cy, cz + Math.sin(a) * ROOM.apothem], rotation: facingCenterRotation(a) };
}

/** World position of a point given in the frame of the vestibule east of `col`. */
export function vestibulePoint(col: number, level: number, x: number, y: number, z: number): [number, number, number] {
  const { position, rotation } = vestibuleFrame(col, level);
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [position[0] + x * c + z * s, position[1] + y, position[2] - x * s + z * c];
}
