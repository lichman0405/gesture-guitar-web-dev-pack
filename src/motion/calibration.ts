/**
 * Calibration module for the gesture guitar.
 * Collects hand samples over a duration and computes neutral positions,
 * noise floor, and strum corridor.
 */

import type { Handedness, HandRole } from "../performance/eventTypes";
import type { Point3 } from "../vision/types";
import { roleForPhysicalHand } from "../vision/types";
import type { CalibrationData, StrumCorridor } from "./calibrationTypes";
import { DEFAULT_CALIBRATION } from "./calibrationTypes";
import type { NormalizedHand } from "../gesture/gestureTypes";

/**
 * Compute the median of a number array.
 * @returns 0 for an empty array.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Compute the mean of a set of 3-D points.
 * @returns {x:0,y:0,z:0} for an empty array.
 */
export function meanPoint(points: Point3[]): Point3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  const n = points.length;
  return { x: sx / n, y: sy / n, z: sz / n };
}

/**
 * Compute population standard deviation.
 * @returns 0 for an empty array.
 */
export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const sq = values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0);
  return Math.sqrt(sq / values.length);
}

/** Samples collected during a calibration session. */
interface Sample {
  scale: number;
  wristRaw: Point3;
  palmCenterRaw: Point3;
  role: HandRole;
}

/**
 * Orchestrates calibration by collecting hand observations and
 * deriving per-user neutral poses and noise baselines.
 */
export class Calibrator {
  private _state: "idle" | "collecting" | "done" | "failed" = "idle";
  private _failureReason: string | null = null;
  private _result: CalibrationData | null = null;
  private _startT = 0;
  private _lastT = 0;
  private readonly _durationSeconds: number;
  private readonly _handedness: Handedness;
  private readonly _sensitivity: number;
  private _samples: Sample[] = [];

  /**
   * @param options.durationSeconds — calibration window length in seconds (default 2.5).
   * @param options.handedness — player's dominant hand (default "right").
   * @param options.sensitivity — multiplier for motion thresholds (default 1).
   */
  constructor(options?: { durationSeconds?: number; handedness?: Handedness; sensitivity?: number }) {
    this._durationSeconds = options?.durationSeconds ?? 2.5;
    this._handedness = options?.handedness ?? "right";
    this._sensitivity = options?.sensitivity ?? 1;
  }

  /** Current calibration lifecycle state. */
  get state(): "idle" | "collecting" | "done" | "failed" {
    return this._state;
  }

  /** Human-readable failure explanation when state is "failed". */
  get failureReason(): string | null {
    return this._failureReason;
  }

  /** Computed calibration result (available once state is "done"). */
  get result(): CalibrationData | null {
    return this._result;
  }

  /** 0..1 progress within the calibration window. */
  get progress(): number {
    if (this._state === "idle") return 0;
    if (this._state === "done" || this._state === "failed") return 1;
    const elapsed = this._lastT - this._startT;
    return Math.min(1, Math.max(0, elapsed / this._durationSeconds));
  }

  /** Start (or restart) a calibration window. */
  begin(startT: number): void {
    this.reset();
    this._state = "collecting";
    this._startT = startT;
    this._lastT = startT;
  }

  /** Ingest hands from a vision frame while collecting. */
  addHands(hands: NormalizedHand[], t: number): void {
    if (this._state !== "collecting") return;
    this._lastT = t;

    for (const hand of hands) {
      const role = roleForPhysicalHand(hand.physical, this._handedness);
      this._samples.push({
        scale: hand.scale,
        wristRaw: hand.wristRaw,
        palmCenterRaw: hand.palmCenterRaw,
        role,
      });
    }

    if (t - this._startT >= this._durationSeconds) {
      this._computeResult();
    }
  }

  /** Force the calibration to conclude early. */
  finish(): CalibrationData | null {
    if (this._state === "done" || this._state === "failed") {
      return this._result;
    }
    if (this._state !== "collecting") {
      return null;
    }
    this._computeResult();
    return this._result;
  }

  /** Discard all data and return to idle. */
  reset(): void {
    this._state = "idle";
    this._failureReason = null;
    this._result = null;
    this._startT = 0;
    this._lastT = 0;
    this._samples = [];
  }

  private _computeResult(): void {
    const totalSamples = this._samples.length;
    const scales = this._samples.map((s) => s.scale);
    const handScale = totalSamples > 0 ? median(scales) : DEFAULT_CALIBRATION.handScale;

    if (totalSamples < 8 || handScale < 0.03) {
      this._state = "failed";
      this._failureReason =
        "Could not see both hands clearly. Move back so both hands fit in frame and hold still.";
      this._result = null;
      return;
    }

    // Noise floor: prefer performance hand, fallback to any hand.
    const perfWrists = this._samples
      .filter((s) => s.role === "performance")
      .map((s) => s.wristRaw);
    const anyWrists = this._samples.map((s) => s.wristRaw);
    const noiseWrists = perfWrists.length > 0 ? perfWrists : anyWrists;

    let noiseFloor: number;
    if (noiseWrists.length > 0) {
      const xs = noiseWrists.map((p) => p.x);
      const ys = noiseWrists.map((p) => p.y);
      const zs = noiseWrists.map((p) => p.z);
      noiseFloor = (stddev(xs) + stddev(ys) + stddev(zs)) / 3;
    } else {
      noiseFloor = DEFAULT_CALIBRATION.noiseFloor;
    }

    // Neutral positions per role.
    const chordSamples = this._samples
      .filter((s) => s.role === "chord")
      .map((s) => s.wristRaw);
    const performanceSamples = this._samples
      .filter((s) => s.role === "performance")
      .map((s) => s.wristRaw);

    const chordHandNeutral = chordSamples.length > 0 ? meanPoint(chordSamples) : null;
    const performanceHandNeutral =
      performanceSamples.length > 0 ? meanPoint(performanceSamples) : null;

    // Strum corridor derived from performance hand, or any available hand.
    const neutralForCorridor = performanceHandNeutral ?? chordHandNeutral;
    let strumCorridor: StrumCorridor;
    if (neutralForCorridor) {
      const neutralY = neutralForCorridor.y;
      const topY = Math.max(0.05, Math.min(0.95, neutralY - 1.0 * handScale));
      const bottomY = Math.max(0.05, Math.min(0.95, neutralY + 1.5 * handScale));
      strumCorridor = { topY, bottomY, neutralY };
    } else {
      strumCorridor = { ...DEFAULT_CALIBRATION.strumCorridor };
    }

    this._result = {
      version: 1,
      calibratedAt: new Date().toISOString(),
      handScale,
      noiseFloor,
      chordHandNeutral,
      performanceHandNeutral,
      strumCorridor,
      sensitivity: this._sensitivity,
    };
    this._state = "done";
  }
}
