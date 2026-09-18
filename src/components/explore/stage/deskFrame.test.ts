import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ROOM, closeupForSide, galleryCenter, galleryRotation, sideAngle, sideYaw, facingCenterRotation } from "../geometry";
import { CASE, planBookcase, shelfPlankY } from "../bookcasePlan";
import { hashString } from "@/lib/hex";
import { COVER, CLOSED_THICKNESS, HOME_POSITION, HOME_TARGET } from "./bookSpace";
import {
  BOOK_SCALE, RAIL_APOTHEM, bookMatrix, bookToWorld, closeupPose, deskBookPose, deskCorners, deskFrame, deskWatchShot,
  readerHomeShot, shelfBookPose, visitorAtDesk, worldToBook, WALK_NEAR, bookDirToWorld, walkShot, DESK, deskLampLocal, galleryToWorld,
} from "./deskFrame";

const near = (a: THREE.Vector3, b: THREE.Vector3, eps: number) => expect(a.distanceTo(b)).toBeLessThan(eps);

describe("reading desks", () => {
  it("stand between the railing and where a walker can go", () => {
    for (let wall = 1; wall <= 5; wall++) {
      for (const c of deskCorners(wall)) {
        const r = Math.hypot(c.x, c.z);
        expect(r).toBeLessThan(ROOM.railRadius + 0.32 - 0.02);
        const u = new THREE.Vector3(Math.cos(sideAngle(wall - 1)), 0, Math.sin(sideAngle(wall - 1)));
        expect(c.x * u.x + c.z * u.z).toBeGreaterThanOrEqual(RAIL_APOTHEM - 1e-9);
      }
    }
  });

  it("face the book towards its wall, in both galleries of a pair", () => {
    for (const side of ["a", "b"] as const) {
      for (let wall = 1; wall <= 5; wall++) {
        const frame = deskFrame(2, side, wall);
        const center = new THREE.Vector3(...galleryCenter(side, 2));
        const towardsReader = bookToWorld(frame, new THREE.Vector3(0, 0, 1)).sub(frame.position).normalize();
        const outwards = frame.position.clone().sub(center).setY(0).normalize();
        expect(towardsReader.dot(outwards)).toBeGreaterThan(0.999);
        expect(frame.position.y).toBeCloseTo(2 * ROOM.level + 0.97, 6);
      }
    }
  });

  it("keep the lamp at the reader's right, towards the far edge", () => {
    for (const side of ["a", "b"] as const) {
      for (let wall = 1; wall <= 5; wall++) {
        const frame = deskFrame(1, side, wall);
        // Metres along the axes of the desk's book space, from the centre of the desk top.
        const onDesk = worldToBook(frame, galleryToWorld(1, side, deskLampLocal(wall))).multiplyScalar(frame.scale);
        expect(Math.abs(onDesk.x - 0.33)).toBeLessThan(1e-9);
        expect(Math.abs(onDesk.z + 0.12)).toBeLessThan(1e-9);
        expect(deskLampLocal(wall).y).toBeCloseTo(DESK.top + 0.3, 9);
      }
    }
  });

  it("round-trips points between book space and the world", () => {
    const frame = deskFrame(-1, "b", 4);
    const p = new THREE.Vector3(0.3, 0.2, -0.7);
    near(worldToBook(frame, bookToWorld(frame, p)), p, 1e-9);
  });

  it("puts the reader's home view as far from the book as the reader does, scaled", () => {
    const shot = readerHomeShot(deskFrame(0, "a", 1));
    expect(shot.position.distanceTo(shot.target)).toBeCloseTo(HOME_POSITION.distanceTo(HOME_TARGET) * BOOK_SCALE, 9);
  });

  it("watches a desk from back over the shaft, with the whole height of its wall in the frame", () => {
    const fov = 58;
    const seed = hashString("babel");
    for (const side of ["a", "b"] as const) {
      for (let wall = 1; wall <= 5; wall++) {
        const frame = deskFrame(0, side, wall);
        const shot = deskWatchShot(frame, fov);
        const center = new THREE.Vector3(...galleryCenter(side, 0));
        // Over the shaft, inside the railing the desk stands on, and a little above the desk top.
        expect(Math.hypot(shot.position.x - center.x, shot.position.z - center.z)).toBeLessThan(ROOM.railRadius);
        expect(shot.position.y - frame.position.y).toBeCloseTo(0.6, 9);
        expect(shot.near).toBeCloseTo(WALK_NEAR, 9);
        // How far above or below the middle of the frame something falls: the lens holds half its fov either way.
        const axis = new THREE.Vector3().subVectors(shot.target, shot.position).normalize();
        const up = new THREE.Vector3(0, 1, 0).projectOnPlane(axis).normalize();
        const rise = (p: THREE.Vector3) => {
          const d = new THREE.Vector3().subVectors(p, shot.position);
          return Math.abs(Math.atan2(d.dot(up), d.dot(axis)));
        };
        const half = THREE.MathUtils.degToRad(fov / 2);
        expect(rise(deskBookPose(frame).position)).toBeLessThan(half);
        for (const shelf of [1, 7]) {
          for (const volume of [1, 16, 31]) expect(rise(shelfBookPose(0, side, wall, shelf, volume, seed).position)).toBeLessThan(half);
        }
      }
    }
  });

  it("stands the visitor at the desk, facing the wall", () => {
    const pose = visitorAtDesk(0, "a", 3);
    expect(Math.hypot(pose.position.x, pose.position.z)).toBeCloseTo(1.9, 9);
    expect(pose.yaw).toBeCloseTo(sideYaw(2), 9);
  });
});

describe("close-up of a shelf", () => {
  it("matches the old shelf view camera in gallery A", () => {
    const { pose, yawRange } = closeupPose(0, "a", 2, 5);
    const bookY = shelfPlankY(5) + CASE.shelfThickness / 2 + CASE.bookH / 2;
    const eye = THREE.MathUtils.clamp(bookY, 1.05, 2.45);
    const expected = closeupForSide(1, 2.6);
    near(pose.position, new THREE.Vector3(expected[0], eye, expected[2]), 1e-9);
    expect(pose.yaw).toBeCloseTo(sideYaw(1), 9);
    expect(pose.pitch).toBeCloseTo(Math.atan2(bookY - eye, 2.6), 9);
    expect(yawRange[1] - yawRange[0]).toBeCloseTo(1.1, 9);
  });
});

describe("a closed book on its shelf", () => {
  it("fills the volume's box on the shelf", () => {
    const seed = hashString("babel");
    for (const [side, level, wall, shelf, volume] of [["a", 0, 3, 4, 18], ["b", 1, 5, 1, 1], ["a", -2, 1, 7, 31]] as const) {
      const pose = shelfBookPose(level, side, wall, shelf, volume, seed);
      const matrix = bookMatrix(pose);
      const placement = planBookcase(seed, wall).placements.find((b) => b.shelf === shelf && b.volume === volume)!;

      // Independent oracle: the same hierarchy HexGalleryScene builds.
      const gallery = new THREE.Object3D();
      gallery.position.set(...galleryCenter(side, level));
      gallery.rotation.y = galleryRotation(side);
      const a = sideAngle(wall - 1);
      const bookcase = new THREE.Object3D();
      bookcase.position.set(Math.cos(a) * (ROOM.apothem - 0.012), 0, Math.sin(a) * (ROOM.apothem - 0.012));
      bookcase.rotation.y = facingCenterRotation(a);
      const box = new THREE.Object3D();
      box.position.set(placement.x, placement.y, placement.z);
      box.scale.set(1, placement.scaleY, 1);
      gallery.add(bookcase);
      bookcase.add(box);
      gallery.updateMatrixWorld(true);

      const boxCorners: THREE.Vector3[] = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
        boxCorners.push(new THREE.Vector3((sx * CASE.bookW) / 2, (sy * CASE.bookH) / 2, (sz * CASE.bookD) / 2).applyMatrix4(box.matrixWorld));

      for (const x of [0, COVER.w / 2]) for (const y of [0, CLOSED_THICKNESS]) for (const z of [-COVER.d / 2, COVER.d / 2]) {
        const corner = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
        const nearest = Math.min(...boxCorners.map((c) => c.distanceTo(corner)));
        expect(nearest).toBeLessThan(0.005);
      }
    }
  });

  it("stands with its spine to the room and its head up", () => {
    const pose = shelfBookPose(1, "b", 5, 1, 1, hashString("babel"));
    const matrix = bookMatrix(pose);
    const gallery = new THREE.Object3D();
    gallery.rotation.y = galleryRotation("b");
    const bookcase = new THREE.Object3D();
    bookcase.rotation.y = facingCenterRotation(sideAngle(4));
    gallery.add(bookcase);
    gallery.updateMatrixWorld(true);
    const intoRoom = bookcase.getWorldDirection(new THREE.Vector3());
    // The spine runs along x = 0; the tops of the pages face -z.
    const spine = new THREE.Vector3(0, CLOSED_THICKNESS / 2, 0).applyMatrix4(matrix).sub(pose.position).normalize();
    const head = new THREE.Vector3(COVER.w / 4, CLOSED_THICKNESS / 2, -COVER.d / 2).applyMatrix4(matrix).sub(pose.position).normalize();
    expect(spine.dot(intoRoom)).toBeGreaterThan(0.999);
    expect(head.y).toBeGreaterThan(0.999);
  });

  it("lies on the desk with the frame's own transform once the correction is gone", () => {
    const frame = deskFrame(0, "a", 2);
    const matrix = bookMatrix(deskBookPose(frame));
    const p = new THREE.Vector3(0.4, 0.05, -0.3);
    near(p.clone().applyMatrix4(matrix), bookToWorld(frame, p), 1e-9);
  });
});

describe("views and directions", () => {
  it("aims a walk shot where a camera with that yaw and pitch looks", () => {
    const pose = { position: new THREE.Vector3(1, 2, 3), yaw: 2.3, pitch: -0.4 };
    const shot = walkShot(pose, 50);
    const camera = new THREE.PerspectiveCamera();
    camera.rotation.order = "YXZ";
    camera.rotation.set(pose.pitch, pose.yaw, 0);
    camera.updateMatrixWorld(true);
    near(shot.position, pose.position, 1e-12);
    near(shot.target.clone().sub(shot.position), camera.getWorldDirection(new THREE.Vector3()), 1e-9);
    expect(shot.fov).toBe(50);
    expect(shot.near).toBe(WALK_NEAR);
  });

  it("turns the shelf close-up with gallery B, on any level", () => {
    const local = closeupPose(0, "a", 4, 2).pose;
    const gallery = new THREE.Object3D();
    gallery.position.set(...galleryCenter("b", -3));
    gallery.rotation.y = galleryRotation("b");
    const eye = new THREE.Object3D();
    eye.position.copy(local.position);
    eye.rotation.order = "YXZ";
    eye.rotation.set(local.pitch, local.yaw, 0);
    gallery.add(eye);
    gallery.updateMatrixWorld(true);

    const shot = walkShot(closeupPose(-3, "b", 4, 2).pose, 50);
    near(shot.position, eye.getWorldPosition(new THREE.Vector3()), 1e-9);
    // An Object3D's world direction is its +z; the eye looks down -z.
    near(shot.target.clone().sub(shot.position), eye.getWorldDirection(new THREE.Vector3()).negate(), 1e-9);
  });

  it("turns book directions without moving or scaling them", () => {
    const frame = deskFrame(1, "b", 5);
    const d = new THREE.Vector3(0.3, -0.5, 0.8);
    near(bookDirToWorld(frame, d), bookToWorld(frame, d).sub(frame.position).divideScalar(frame.scale), 1e-9);
  });
});
