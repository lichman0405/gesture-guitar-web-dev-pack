import { describe, expect, it } from "vitest";
import type { NormalizedHand } from "../gesture/gestureTypes";
import type { Point3 } from "../vision/types";
import { Calibrator, median, meanPoint, stddev } from "./calibration";

function makeLandmarks(): Point3[] {
  return Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
}

function makeHand(
  physical: "Left" | "Right",
  wristRaw: Point3,
  scale: number,
  jitter?: Point3
): NormalizedHand {
  const j = jitter ?? { x: 0, y: 0, z: 0 };
  return {
    physical,
    landmarks: makeLandmarks(),
    scale,
    wristRaw: { x: wristRaw.x + j.x, y: wristRaw.y + j.y, z: wristRaw.z + j.z },
    palmCenterRaw: { x: wristRaw.x, y: wristRaw.y, z: wristRaw.z },
    t: 0,
  };
}

describe("Calibrator", () => {
  it("full happy path: two hands, right-handed", () => {
    const duration = 2.6;
    const calibrator = new Calibrator({
      durationSeconds: duration,
      handedness: "right",
      sensitivity: 1,
    });
    calibrator.begin(0);

    for (let i = 0; i < 30; i++) {
      const t = (i / 29) * duration;
      const leftJitter = { x: Math.sin(i) * 0.002, y: Math.cos(i) * 0.002, z: 0 };
      const rightJitter = { x: Math.cos(i) * 0.002, y: Math.sin(i) * 0.002, z: 0 };
      const leftHand = makeHand(
        "Left",
        { x: 0.3, y: 0.5, z: 0 },
        0.2 + Math.sin(i * 0.5) * 0.01,
        leftJitter
      );
      const rightHand = makeHand(
        "Right",
        { x: 0.7, y: 0.55, z: 0 },
        0.2 + Math.cos(i * 0.5) * 0.01,
        rightJitter
      );
      calibrator.addHands([leftHand, rightHand], t);
    }

    expect(calibrator.state).toBe("done");
    expect(calibrator.progress).toBe(1);
    expect(calibrator.result).not.toBeNull();

    const result = calibrator.result!;
    expect(result.handScale).toBeCloseTo(0.2, 1);
    expect(result.performanceHandNeutral!.x).toBeCloseTo(0.7, 1);
    expect(result.chordHandNeutral!.x).toBeCloseTo(0.3, 1);

    const c = result.strumCorridor;
    expect(c.topY).toBeLessThan(c.neutralY);
    expect(c.neutralY).toBeLessThan(c.bottomY);
    expect(c.neutralY).toBeCloseTo(0.55, 1);

    expect(result.noiseFloor).toBeGreaterThan(0);
    expect(result.noiseFloor).toBeLessThan(0.01);
    expect(result.sensitivity).toBe(1);
    expect(result.version).toBe(1);
    expect(result.calibratedAt).toBeTruthy();
  });

  it("left-handed mode swaps roles", () => {
    const duration = 2.6;
    const calibrator = new Calibrator({
      durationSeconds: duration,
      handedness: "left",
      sensitivity: 1,
    });
    calibrator.begin(0);

    for (let i = 0; i < 30; i++) {
      const t = (i / 29) * duration;
      const leftHand = makeHand("Left", { x: 0.3, y: 0.5, z: 0 }, 0.2);
      const rightHand = makeHand("Right", { x: 0.7, y: 0.55, z: 0 }, 0.2);
      calibrator.addHands([leftHand, rightHand], t);
    }

    expect(calibrator.state).toBe("done");
    const result = calibrator.result!;
    expect(result.performanceHandNeutral!.x).toBeCloseTo(0.3, 1);
    expect(result.chordHandNeutral!.x).toBeCloseTo(0.7, 1);
  });

  it("too-few samples → failed with actionable reason; result null", () => {
    const calibrator = new Calibrator({
      durationSeconds: 2.5,
      handedness: "right",
    });
    calibrator.begin(0);
    const hand = makeHand("Right", { x: 0.5, y: 0.5, z: 0 }, 0.2);
    calibrator.addHands([hand], 0.1);
    calibrator.finish();

    expect(calibrator.state).toBe("failed");
    expect(calibrator.failureReason).toBeTruthy();
    expect(calibrator.result).toBeNull();
  });

  it("tiny handScale (0.01) → failed", () => {
    const calibrator = new Calibrator({
      durationSeconds: 2.5,
      handedness: "right",
    });
    calibrator.begin(0);
    for (let i = 0; i < 10; i++) {
      const hand = makeHand("Right", { x: 0.5, y: 0.5, z: 0 }, 0.01);
      calibrator.addHands([hand], i * 0.3);
    }
    calibrator.finish();

    expect(calibrator.state).toBe("failed");
    expect(calibrator.failureReason).toBeTruthy();
    expect(calibrator.result).toBeNull();
  });

  it("progress is 0 before begin; addHands ignored when idle", () => {
    const calibrator = new Calibrator({ durationSeconds: 2.5 });
    expect(calibrator.progress).toBe(0);

    const hand = makeHand("Right", { x: 0.5, y: 0.5, z: 0 }, 0.2);
    calibrator.addHands([hand], 1);
    expect(calibrator.progress).toBe(0);
    expect(calibrator.state).toBe("idle");
  });

  it("reset returns to idle", () => {
    const calibrator = new Calibrator({ durationSeconds: 2.5 });
    calibrator.begin(0);
    const hand = makeHand("Right", { x: 0.5, y: 0.5, z: 0 }, 0.2);
    calibrator.addHands([hand], 0.1);
    calibrator.reset();

    expect(calibrator.state).toBe("idle");
    expect(calibrator.progress).toBe(0);
    expect(calibrator.result).toBeNull();
    expect(calibrator.failureReason).toBeNull();
  });

  it("median / meanPoint / stddev unit correctness", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);

    expect(meanPoint([{ x: 1, y: 2, z: 3 }, { x: 3, y: 4, z: 5 }])).toEqual({
      x: 2,
      y: 3,
      z: 4,
    });
    expect(meanPoint([])).toEqual({ x: 0, y: 0, z: 0 });

    expect(stddev([2, 2, 2])).toBe(0);
    expect(stddev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2), 5);
    expect(stddev([])).toBe(0);
  });

  it("one-hand-only calibration still succeeds", () => {
    const duration = 2.6;
    const calibrator = new Calibrator({
      durationSeconds: duration,
      handedness: "right",
    });
    calibrator.begin(0);

    for (let i = 0; i < 15; i++) {
      const t = (i / 14) * duration;
      const hand = makeHand("Right", { x: 0.7, y: 0.55, z: 0 }, 0.2);
      calibrator.addHands([hand], t);
    }

    expect(calibrator.state).toBe("done");
    const result = calibrator.result!;
    expect(result.performanceHandNeutral).not.toBeNull();
    expect(result.performanceHandNeutral!.x).toBeCloseTo(0.7, 1);
    expect(result.chordHandNeutral).toBeNull();
    expect(result.strumCorridor.neutralY).toBeCloseTo(0.55, 2);
  });
});
