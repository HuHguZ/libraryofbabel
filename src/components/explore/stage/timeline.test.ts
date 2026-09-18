import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { BookPose, CameraShot } from "./poses";
import { DURATION, glideTimeline, returnTimeline, reversed, scaled, swapTimeline, takeTimeline, type StageFrame, type SwapFrame } from "./timeline";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const shot = (p: THREE.Vector3, t: THREE.Vector3, fov: number, near: number): CameraShot => ({ position: p, target: t, fov, near });
const pose = (p: THREE.Vector3, yaw: number, s = v(1, 1, 1)): BookPose => ({ position: p, quaternion: new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), yaw), scale: s });

const eye = shot(v(0, 1.6, 2.2), v(0, 1.6, 3.2), 58, 0.05);
const home = shot(v(0.05, 1.33, 1.6), v(0, 1.02, 1.3), 44, 0.003);
const onShelf = pose(v(0.1, 1.2, 3.0), 0.3, v(1.06, 2.84, 1.0));
const onDesk = pose(v(0, 1.0, 1.3), 1.2);
const input = { cameraFrom: eye, bookFrom: onShelf, bookTo: onDesk, shelfNormal: v(0, 0, -1), cameraTo: home, seed: 7 };

const close = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-6) => expect(a.distanceTo(b)).toBeLessThan(eps);
const closeShot = (a: CameraShot, b: CameraShot) => {
  close(a.position, b.position);
  close(a.target, b.target);
  expect(a.fov).toBeCloseTo(b.fov, 6);
  expect(a.near).toBeCloseTo(b.near, 9);
};
const sameFrame = (a: StageFrame, b: StageFrame) => {
  close(a.camera.position, b.camera.position);
  close(a.camera.target, b.camera.target);
  expect(a.camera.fov).toBeCloseTo(b.camera.fov, 6);
  expect(a.camera.near).toBeCloseTo(b.camera.near, 9);
  close(a.book!.position, b.book!.position);
  expect(a.book!.quaternion.angleTo(b.book!.quaternion)).toBeLessThan(1e-6);
  close(a.book!.scale, b.book!.scale);
  expect(a.openness).toBeCloseTo(b.openness, 6);
};

function expectContinuous(tl: ReturnType<typeof takeTimeline>) {
  let prev = tl.sample(0);
  for (let t = 1 / 120; t <= tl.duration + 1e-9; t += 1 / 120) {
    const cur = tl.sample(t);
    expect(cur.camera.position.distanceTo(prev.camera.position)).toBeLessThan(0.06);
    expect(cur.book!.position.distanceTo(prev.book!.position)).toBeLessThan(0.06);
    expect(cur.book!.quaternion.angleTo(prev.book!.quaternion)).toBeLessThan(0.08);
    expect(Math.abs(cur.openness - prev.openness)).toBeLessThan(0.05);
    prev = cur;
  }
}

// The eye stands right in the arc from the shelf to the desk behind it: mid-flight, the book must go round it.
function expectClear(tl: ReturnType<typeof takeTimeline>, from: number, to: number) {
  for (let t = from; t <= to; t += 1 / 120) {
    const f = tl.sample(t);
    expect(f.book!.position.distanceTo(f.camera.position)).toBeGreaterThan(0.55);
  }
}

describe("takeTimeline", () => {
  const tl = takeTimeline(input);

  it("lasts as long as a take", () => expect(tl.duration).toBeCloseTo(DURATION.take, 9));

  it("starts at the eye with the book closed on its shelf", () => {
    const f = tl.sample(0);
    close(f.camera.position, eye.position);
    close(f.camera.target, eye.target);
    close(f.book!.position, onShelf.position);
    close(f.book!.scale, onShelf.scale);
    expect(f.openness).toBe(0);
    expect(f.deskLight).toBe(0);
  });

  it("ends open on the desk at the reader's home view", () => {
    const f = tl.sample(tl.duration);
    close(f.camera.position, home.position);
    close(f.camera.target, home.target);
    expect(f.camera.fov).toBeCloseTo(44, 9);
    expect(f.camera.near).toBeCloseTo(0.003, 12);
    close(f.book!.position, onDesk.position);
    expect(f.book!.quaternion.angleTo(onDesk.quaternion)).toBeLessThan(1e-6);
    close(f.book!.scale, v(1, 1, 1));
    expect(f.openness).toBe(1);
    expect(f.deskLight).toBe(1);
  });

  it("moves without jumps", () => expectContinuous(tl));

  it("lets the book fly past the visitor rather than through them", () => expectClear(tl, 0.45, 0.85));

  it("clamps time and fills the frame it is given", () => {
    const out = tl.sample(0);
    expect(tl.sample(99, out)).toBe(out);
    sameFrame(out, tl.sample(tl.duration));
  });
});

describe("returnTimeline", () => {
  const tl = returnTimeline({ cameraFrom: home, bookFrom: onDesk, bookTo: onShelf, shelfNormal: v(0, 0, -1), cameraTo: eye, seed: 7 });

  it("closes the book first and ends on the shelf at the eye", () => {
    expect(tl.duration).toBeCloseTo(DURATION.return, 9);
    expect(tl.sample(0).openness).toBe(1);
    const end = tl.sample(tl.duration);
    close(end.book!.position, onShelf.position);
    close(end.book!.scale, onShelf.scale);
    close(end.camera.position, eye.position);
    expect(end.openness).toBe(0);
    expect(end.deskLight).toBe(0);
  });

  it("moves without jumps", () => expectContinuous(tl));

  it("lets the book fly past the visitor rather than through them", () => expectClear(tl, 0.85, 1.25));
});

describe("reversed and scaled", () => {
  const tl = takeTimeline(input);

  it("plays backwards from a moment", () => {
    const back = reversed(tl, 0.8);
    expect(back.duration).toBeCloseTo(0.8, 9);
    sameFrame(back.sample(0.3), tl.sample(0.5));
    sameFrame(back.sample(0.8), tl.sample(0));
  });

  it("stretches time", () => {
    const fast = scaled(tl, 0.35);
    expect(fast.duration).toBeCloseTo(tl.duration * 0.35, 9);
    sameFrame(fast.sample(0.35), tl.sample(1.0));
  });
});

describe("glideTimeline", () => {
  it("goes from one shot to another and has no book", () => {
    const tl = glideTimeline(eye, home);
    expect(tl.duration).toBeCloseTo(DURATION.glide, 9);
    expect(tl.sample(0.3).book).toBeNull();
    close(tl.sample(tl.duration).camera.position, home.position);
    close(tl.sample(0).camera.target, eye.target);
  });
});

describe("swapTimeline", () => {
  // B's own shelf pose: distinct from A's (onShelf) so the two books are never mistaken for each other.
  const shelfB = pose(v(0.5, 1.2, 2.6), -0.4, v(1.04, 2.9, 1.01));
  const departure = returnTimeline({ cameraFrom: home, bookFrom: onDesk, bookTo: onShelf, shelfNormal: v(0, 0, -1), cameraTo: home, seed: 3 });
  const arrival = takeTimeline({ cameraFrom: home, bookFrom: shelfB, bookTo: onDesk, shelfNormal: v(0, 0, -1), cameraTo: home, seed: 5 });
  // A step back from the desk over the shaft, the wall of shelves (at +z) behind it; the reader had wandered off to `eye`.
  const wide = shot(v(0, 1.6, -0.5), v(0, 1.65, 1.5), 58, 0.05);
  const tl = swapTimeline(departure, arrival, { from: eye, wide, home });
  /** While the camera stands at the wide shot: after drawing back (80 % of the departure), before coming home (the last 70 % of the arrival). */
  const held = [departure.duration * 0.8 + 0.01, tl.duration - arrival.duration * 0.7 - 0.01] as const;

  it("lasts as long as both flights and the gap between them", () => {
    expect(tl.duration).toBeCloseTo(departure.duration + DURATION.swapGap + arrival.duration, 9);
  });

  it("starts with A open on the desk and B still on its own shelf", () => {
    const f = tl.sample(0) as SwapFrame;
    close(f.book!.position, onDesk.position);
    expect(f.openness).toBe(1);
    close(f.incoming.book!.position, shelfB.position);
    expect(f.incoming.openness).toBe(0);
    expect(f.phase).toBe(0);
  });

  it("ends with B open on the desk", () => {
    const f = tl.sample(tl.duration) as SwapFrame;
    close(f.incoming.book!.position, onDesk.position);
    expect(f.incoming.openness).toBe(1);
    expect(f.phase).toBe(1);
  });

  it("lands A on its shelf, then leaves B off its own, with the gap between them", () => {
    const landed = tl.sample(departure.duration) as SwapFrame;
    close(landed.book!.position, onShelf.position);
    expect(landed.openness).toBe(0);
    close(landed.incoming.book!.position, shelfB.position); // B has not lifted a moment before the gap ends
    const leaves = tl.sample(departure.duration + DURATION.swapGap) as SwapFrame;
    close(leaves.incoming.book!.position, shelfB.position); // ...nor at the instant it does: this is its own t = 0
    expect(leaves.incoming.openness).toBe(0);
  });

  it("shows A until mid-gap, then B", () => {
    const mid = departure.duration + DURATION.swapGap / 2;
    expect((tl.sample(mid - 0.001) as SwapFrame).phase).toBe(0);
    expect((tl.sample(mid + 0.001) as SwapFrame).phase).toBe(1);
  });

  it("takes the camera it is handed and leaves it at the desk's home shot", () => {
    closeShot(tl.sample(0).camera, eye);
    closeShot(tl.sample(tl.duration).camera, home);
  });

  it("draws the camera back from the desk while the books change places", () => {
    const away = (t: number) => tl.sample(t).camera.position.distanceTo(onDesk.position);
    for (const t of held) expect(away(t)).toBeGreaterThan(Math.max(away(0), away(tl.duration)) + 0.5);
    // Both flights are watched from the same shot: it is held still between drawing back and coming home.
    for (const t of held) closeShot(tl.sample(t).camera, wide);
    for (const t of [departure.duration, departure.duration + DURATION.swapGap]) closeShot(tl.sample(t).camera, wide);
  });

  it("comes home as the new book settles and opens", () => {
    const coming = tl.duration - arrival.duration * 0.7;
    const towards = (t: number) => tl.sample(t).camera.position.distanceTo(home.position);
    expect(towards(coming + 0.2)).toBeLessThan(towards(coming));
    expect(towards(tl.duration - 0.2)).toBeLessThan(towards(coming + 0.2));
    expect(tl.sample(coming + 0.2).camera.fov).toBeLessThan(wide.fov);
  });

  it("keeps the desk lamp lit throughout", () => {
    for (const t of [0, departure.duration, departure.duration + DURATION.swapGap, tl.duration]) expect(tl.sample(t).deskLight).toBe(1);
  });

  it("moves without jumps", () => expectContinuous(tl));

  it("moves the incoming book without jumps too", () => {
    let prev = tl.sample(0) as SwapFrame;
    for (let t = 1 / 120; t <= tl.duration + 1e-9; t += 1 / 120) {
      const cur = tl.sample(t) as SwapFrame;
      expect(cur.incoming.book!.position.distanceTo(prev.incoming.book!.position)).toBeLessThan(0.06);
      prev = cur;
    }
  });

  it("plays backwards from wherever it is, the camera with it", () => {
    for (const from of [departure.duration * 0.5, held[0], tl.duration * 0.7]) {
      const back = reversed(tl, from);
      expect(back.duration).toBeCloseTo(from, 9);
      for (const t of [0, 0.25, from]) sameFrame(back.sample(t), tl.sample(from - t));
    }
  });
});
