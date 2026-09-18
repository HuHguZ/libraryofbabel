import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { closeupPose } from "./deskFrame";
import { nearestYaw } from "./poses";

const TURN = Math.PI * 2;

describe("nearestYaw", () => {
  it("leaves a yaw that is already the nearest alone", () => {
    expect(nearestYaw(0.2, 0.5)).toEqual({ yaw: 0.5 });
    expect(nearestYaw(0.2, 0.5, [0, 1])).toEqual({ yaw: 0.5, range: [0, 1] });
  });

  it("brings a close-up in gallery B a turn back to a camera that never turned round", () => {
    const { pose, yawRange } = closeupPose(0, "b", 4, 3);
    expect(pose.yaw).toBeGreaterThan(Math.PI);
    const { yaw, range } = nearestYaw(-2, pose.yaw, yawRange);
    expect(yaw).toBeCloseTo(pose.yaw - TURN, 12);
    expect(range![0]).toBeCloseTo(yawRange[0] - TURN, 12);
    expect(range![1]).toBeCloseTo(yawRange[1] - TURN, 12);
  });

  it("follows a camera that has turned round several times, either way", () => {
    expect(nearestYaw(5 * TURN + 0.3, 0.1).yaw).toBeCloseTo(5 * TURN + 0.1, 12);
    expect(nearestYaw(-3 * TURN - 0.4, 0.1).yaw).toBeCloseTo(-3 * TURN + 0.1, 12);
  });

  it("shifts by whole turns only, lands within half a turn, and keeps the yaw inside its range", () => {
    for (let current = -20; current <= 20; current += 0.37) {
      for (let target = -1; target <= 2 * TURN + 1; target += 0.29) {
        const { yaw, range } = nearestYaw(current, target, [target - 0.55, target + 0.55]);
        const turns = (yaw - target) / TURN;
        expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9);
        expect(Math.abs(yaw - current)).toBeLessThanOrEqual(Math.PI + 1e-9);
        expect(range![0]).toBeCloseTo(yaw - 0.55, 9);
        expect(range![1]).toBeCloseTo(yaw + 0.55, 9);
      }
    }
  });

  it("never lets the controls' clamp swing the view a turn round", () => {
    // What GalleryControls does with a small mouse turn once the range is set and the camera placed.
    const { pose, yawRange } = closeupPose(2, "b", 5, 6);
    for (const current of [-7.5, -1, 0, 3.2, 9.9]) {
      const { yaw, range } = nearestYaw(current, pose.yaw, yawRange);
      const turned = THREE.MathUtils.clamp(yaw + 0.01, range![0], range![1]);
      expect(Math.abs(turned - yaw)).toBeLessThanOrEqual(0.01 + 1e-12);
    }
  });
});
