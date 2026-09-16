/**
 * The leaves of an open book and how they turn, free of three.js so it can be tested headless.
 *
 * Leaf k carries page 2k + 1 on its front and page 2k + 2 on its back. Its progress p runs from 0
 * (lying on the right) to 1 (lying on the left), so spread k lies open once leaves 0..k-1 are at 1.
 * Every leaf moves on its own: several can be in the air at once, one lifting as soon as the leaf
 * above it is a little ahead, and a long run of pending turns is flipped as one bunch.
 * No two turns are alike: each time a leaf lifts it draws a new character (speed, springiness,
 * which corner leads, how the paper ripples), read by `trait`.
 */

export interface TurnParams {
  /** Top speed, turns per second. */
  speed: number;
  /** Turns per second²: how quickly a leaf picks up speed and slows down before landing. */
  accel: number;
  /** A leaf still falls onto its stack at this speed. */
  land: number;
  /** A leaf lifts only once the leaf above it is this far ahead. */
  gap: number;
  /** The most a backlog of turns can speed the leaves up. */
  boost: number;
  /** With more turns than this still waiting, the rest lift together as one bunch. */
  queue: number;
  /** Sheets (leaves or bunches) in the air at once. */
  sheets: number;
}

export const TURN: TurnParams = {
  speed: 1.7,
  accel: 4.8,
  land: 0.55,
  gap: 0.09,
  boost: 4,
  queue: 3,
  sheets: 10,
};

export interface Leaves {
  p: Float32Array;
  v: Float32Array;
  /** How far the free edge of each leaf trails behind (negative: it leads), sprung around the leaf's speed. */
  bend: Float32Array;
  bendV: Float32Array;
  /** Drawn each time the leaf lifts; its traits give the turn a character of its own. */
  seed: Float32Array;
  /** -1: turns together with the leaf before it, 1: with the leaf after it, 0: on its own. */
  link: Int8Array;
}

/** One sheet in the air: leaves from..to turning as one. */
export interface Sheet {
  from: number;
  to: number;
  p: number;
  bend: number;
  seed: number;
}

export interface Arrangement {
  /** Leaves lying on the left: the left page is page 2 × left. */
  left: number;
  /** First leaf lying on the right: the right page is page 2 × right + 1. */
  right: number;
  /** Sum of progress, i.e. how many leaves are turned, fractions included. */
  turned: number;
  sheets: Sheet[];
}

export function createLeaves(count: number, open: number): Leaves {
  const leaves = {
    p: new Float32Array(count),
    v: new Float32Array(count),
    bend: new Float32Array(count),
    bendV: new Float32Array(count),
    seed: new Float32Array(count),
    link: new Int8Array(count),
  };
  leaves.p.fill(1, 0, Math.max(0, Math.min(count, open)));
  return leaves;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The i-th trait of a turn with this seed, uniform in 0..1. */
export function trait(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 * 1000 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A leaf lifting off: a new character, and the free edge a little ahead, as when a page is taken by its corner. */
function lift(s: Leaves, k: number, dir: 1 | -1, random: () => number) {
  s.seed[k] = random();
  s.bend[k] = -dir * (0.25 + 0.75 * trait(s.seed[k], 13));
  s.bendV[k] = 0;
}

/** Advances every leaf towards the spread `target` by dt seconds. */
export function stepLeaves(s: Leaves, target: number, dt: number, t: TurnParams = TURN, random: () => number = Math.random): void {
  const { p, v, link, seed } = s;
  const n = p.length;
  const split = clamp(Math.round(target), 0, n);
  if (dt <= 0) return;

  let backlog = 0;
  let airborne = 0;
  for (let k = 0; k < n; k++) {
    if (p[k] !== (k < split ? 1 : 0)) backlog++;
    if (p[k] > 0 && p[k] < 1 && link[k] === 0) airborne++;
  }
  const boost = Math.min(t.boost, 1 + 0.5 * Math.max(0, backlog - 1));
  const speed = t.speed * boost;
  const accel = t.accel * boost;
  const land = Math.min(speed, t.land * boost);

  // Forward: leaves 0..split-1 are to lie on the left. Each is held back by the leaf above it (k - 1).
  for (let k = 0; k < split; k++) {
    if (link[k] === 1) link[k] = 0; // a bunch that was turning back comes apart
    if (link[k] === -1) {
      if (k > 0) {
        p[k] = p[k - 1];
        v[k] = v[k - 1];
        seed[k] = seed[k - 1];
        if (p[k] >= 1) link[k] = 0;
        continue;
      }
      link[k] = 0;
    }
    const old = p[k];
    if (old >= 1 && v[k] === 0) continue;
    const limit = k === 0 || p[k - 1] >= 1 ? 1 : p[k - 1] - t.gap * (0.6 + 0.8 * trait(seed[k - 1], 1));
    if (old <= 0 && v[k] === 0) {
      if (limit <= 0 || airborne >= t.sheets) continue;
      airborne++;
      lift(s, k, 1, random);
      const waiting = split - 1 - k;
      for (let j = k + 1; j <= k + waiting - t.queue; j++) link[j] = -1;
    }
    let vel = v[k];
    const pace = 0.8 + 0.4 * trait(seed[k], 0);
    const want = Math.max(land, Math.min(speed * pace, Math.sqrt(2 * accel * pace * (1 - old))));
    vel += clamp(want - vel, -accel * pace * dt, accel * pace * dt);
    let next = old + vel * dt;
    const cap = Math.max(old, limit);
    if (next >= cap) {
      next = cap;
      vel = cap >= 1 ? 0 : Math.max(0, Math.min(vel, (cap - old) / dt));
    }
    if (next <= 0) {
      next = 0;
      vel = 0;
    }
    p[k] = next;
    v[k] = vel;
  }

  // Backward: leaves split..n-1 are to lie on the right. Each is held back by the leaf above it (k + 1).
  for (let k = n - 1; k >= split; k--) {
    if (link[k] === -1) link[k] = 0;
    if (link[k] === 1) {
      if (k < n - 1) {
        p[k] = p[k + 1];
        v[k] = v[k + 1];
        seed[k] = seed[k + 1];
        if (p[k] <= 0) link[k] = 0;
        continue;
      }
      link[k] = 0;
    }
    const old = p[k];
    if (old <= 0 && v[k] === 0) continue;
    const limit = k === n - 1 || p[k + 1] <= 0 ? 0 : p[k + 1] + t.gap * (0.6 + 0.8 * trait(seed[k + 1], 1));
    if (old >= 1 && v[k] === 0) {
      if (limit >= 1 || airborne >= t.sheets) continue;
      airborne++;
      lift(s, k, -1, random);
      const waiting = k - split;
      for (let j = k - 1; j >= k - (waiting - t.queue); j--) link[j] = 1;
    }
    let vel = v[k];
    const pace = 0.8 + 0.4 * trait(seed[k], 0);
    const want = -Math.max(land, Math.min(speed * pace, Math.sqrt(2 * accel * pace * old)));
    vel += clamp(want - vel, -accel * pace * dt, accel * pace * dt);
    let next = old + vel * dt;
    const floor = Math.min(old, limit);
    if (next <= floor) {
      next = floor;
      vel = floor <= 0 ? 0 : Math.min(0, Math.max(vel, (floor - old) / dt));
    }
    if (next >= 1) {
      next = 1;
      vel = 0;
    }
    p[k] = next;
    v[k] = vel;
  }

  // Leaves never pass through each other.
  for (let k = 1; k < n; k++) {
    if (p[k] > p[k - 1]) {
      p[k] = p[k - 1];
      v[k] = p[k] >= 1 || p[k] <= 0 ? 0 : Math.min(v[k], v[k - 1]);
    }
  }

  // The faster a leaf moves, the more its free edge trails behind. The paper is springy, not stiff:
  // it lags, overshoots and settles, each leaf with its own stiffness and damping.
  const h = Math.min(dt, 1 / 30);
  for (let k = 0; k < n; k++) {
    if (p[k] <= 0 || p[k] >= 1) {
      s.bend[k] = 0;
      s.bendV[k] = 0;
      continue;
    }
    const want = clamp(v[k] / t.speed, -1.3, 1.3) * (0.55 + 0.9 * trait(seed[k], 2));
    const omega = 9 + 10 * trait(seed[k], 3);
    const zeta = 0.22 + 0.3 * trait(seed[k], 4);
    for (let left = dt; left > 1e-6; left -= h) {
      const d = Math.min(h, left);
      s.bendV[k] += (omega * omega * (want - s.bend[k]) - 2 * zeta * omega * s.bendV[k]) * d;
      s.bend[k] = clamp(s.bend[k] + s.bendV[k] * d, -1.6, 1.6);
    }
  }
}

/** Which pages lie open and which sheets are in the air. */
export function arrangeLeaves(s: Leaves): Arrangement {
  const { p, link } = s;
  const n = p.length;
  let left = 0;
  while (left < n && p[left] >= 1) left++;
  let right = left;
  while (right < n && p[right] > 0) right++;
  let turned = 0;
  for (let k = 0; k < n; k++) turned += p[k];

  const sheets: Sheet[] = [];
  for (let k = left; k < right; k++) {
    const last = sheets[sheets.length - 1];
    const joined = last && last.to === k - 1 && (link[k] === -1 || link[k - 1] === 1) && p[k] === p[k - 1];
    if (joined) last.to = k;
    else sheets.push({ from: k, to: k, p: p[k], bend: s.bend[k], seed: s.seed[k] });
  }
  return { left, right, turned, sheets };
}

/** True once nothing is in the air and the open spread is `target`. */
export function settledAt(s: Leaves, target: number): boolean {
  const { left, right } = arrangeLeaves(s);
  return left === right && left === target;
}
