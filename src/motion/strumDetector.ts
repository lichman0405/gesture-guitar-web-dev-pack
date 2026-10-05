import type { CalibrationData, StrumThresholds } from "./calibrationTypes";
import { DEFAULT_CALIBRATION, DEFAULT_STRUM_THRESHOLDS } from "./calibrationTypes";
import type { StrumEvent } from "../performance/eventTypes";
import { VelocityEstimator } from "./velocityEstimator";
import { ExponentialSmoother } from "./motionSmoother";

export interface StrumDetectorOptions {
  thresholds?: Partial<StrumThresholds>;
  muted?: () => boolean;
}

type Direction = "down" | "up";

/**
 * Vision-based strum detector for the performance hand.
 *
 * Tuning:
 * - y smoother alpha = 0.6 — slightly heavier than the velocity smoother
 *   because raw y comes from noisy landmark detection.
 * - VelocityEstimator: window 0.12 s, smoothing alpha 0.5. The window must
 *   span several frames even on slow cameras: at 60 ms it collapses to 1–2
 *   samples once the frame rate drops below ~16 fps, which kills the slope
 *   estimate exactly when the pipeline is struggling.
 * - Tracking timeout = 0.8 s.
 *
 * Coordinate system: image-normalized, y increases downward.
 */
export class StrumDetector {
  private calibration: CalibrationData;
  private readonly options: StrumDetectorOptions;
  private thresholds: StrumThresholds;

  private readonly ySmoother: ExponentialSmoother;
  private readonly velocityEstimator: VelocityEstimator;

  private _state: "idle" | "tracking" | "cooldown" = "idle";
  private armed = true;

  // Tracking accumulators
  private trackingStartT = 0;
  private accumulatedDisplacement = 0;
  private peakAbsV = 0;
  private direction: Direction | null = null;
  private lastTrackedY = 0;
  private previousRawY: number | null = null;

  // Cooldown
  private cooldownEndT = 0;

  constructor(calibration: CalibrationData = DEFAULT_CALIBRATION, options?: StrumDetectorOptions) {
    this.calibration = calibration;
    this.options = options ?? {};
    this.thresholds = { ...DEFAULT_STRUM_THRESHOLDS, ...this.options.thresholds };
    this.ySmoother = new ExponentialSmoother(0.6);
    this.velocityEstimator = new VelocityEstimator({ windowSeconds: 0.12, smoothingAlpha: 0.5 });
  }

  /** Feed a new palm-center y (null = hand lost). */
  update(y: number | null, t: number): StrumEvent | null {
    if (y === null) {
      // No-motion: inject a constant sample so velocity decays toward 0.
      const lastY = this.ySmoother.value;
      if (lastY !== null) {
        this.velocityEstimator.addSample(t, lastY);
      }
      return null;
    }

    const smoothedY = this.ySmoother.update(y);
    this.velocityEstimator.addSample(t, smoothedY);
    const rawV = this.velocityEstimator.velocity;

    // Captured before overwriting: the trigger seed needs the PREVIOUS frame.
    const prevRawY = this.previousRawY;
    this.previousRawY = y;

    // Normalize by handScale, then apply sensitivity.
    const normalizedV = (rawV / this.calibration.handScale) * this.calibration.sensitivity;
    const absV = Math.abs(normalizedV);

    const topY = this.calibration.strumCorridor.topY;
    const bottomY = this.calibration.strumCorridor.bottomY;
    const inCorridor = smoothedY >= topY && smoothedY <= bottomY;

    // Manage cooldown expiration.
    if (this._state === "cooldown") {
      if (t >= this.cooldownEndT) {
        this._state = "idle";
      } else {
        return null;
      }
    }

    if (this._state === "idle") {
      if (this.armed && absV >= this.thresholds.minVelocity && inCorridor) {
        this._state = "tracking";
        this.trackingStartT = t;
        this.accumulatedDisplacement = 0;
        this.peakAbsV = absV;
        this.direction = normalizedV > 0 ? "down" : "up";
        // Seed from the previous raw position so the motion that caused the
        // trigger is counted too — at low frame rates the entire sweep can
        // sit between the previous sample and this one, and seeding from the
        // EMA-lagged smoothed y leaves the total just short of the threshold.
        this.lastTrackedY = prevRawY ?? smoothedY;
        // Fall through: this frame already contributes displacement.
      } else {
        if (absV < this.thresholds.minVelocity * 0.5) {
          this.armed = true;
        }
        return null;
      }
    }

    // this._state === "tracking"
    if (t - this.trackingStartT > 0.8) {
      this._state = "idle";
      this.armed = false;
      return null;
    }

    if (absV > this.peakAbsV) {
      this.peakAbsV = absV;
    }

    // Accumulate displacement in handScale units from the RAW y. Using the
    // smoothed y here makes the total converge to (full sweep − EMA lag) from
    // below, so at low frame rates the threshold is approached but never
    // crossed; signed raw deltas still cancel jitter at high frame rates.
    const dy = ((y - this.lastTrackedY) / this.calibration.handScale) * this.calibration.sensitivity;
    this.accumulatedDisplacement += dy;
    this.lastTrackedY = y;

    const currentDir: Direction | null = normalizedV > 0 ? "down" : normalizedV < 0 ? "up" : this.direction;

    // Direction reversal before minDisplacement → reset to new direction.
    if (
      currentDir !== null &&
      this.direction !== null &&
      currentDir !== this.direction &&
      Math.abs(this.accumulatedDisplacement) < this.thresholds.minDisplacement
    ) {
      this.direction = currentDir;
      this.accumulatedDisplacement = 0;
      this.peakAbsV = absV;
      this.trackingStartT = t;
      this.lastTrackedY = smoothedY;
      return null;
    }

    // Fire when displacement threshold is reached.
    if (Math.abs(this.accumulatedDisplacement) >= this.thresholds.minDisplacement) {
      const event: StrumEvent = {
        type: "strum",
        t,
        direction: this.accumulatedDisplacement > 0 ? "down" : "up",
        velocity: this.peakAbsV,
        intensity: Math.max(0.15, Math.min(1, this.peakAbsV / this.thresholds.accentVelocity)),
        articulation: this.options.muted?.() ? "muted" : "normal",
        source: "vision",
      };
      this._state = "cooldown";
      this.cooldownEndT = t + this.thresholds.cooldownSeconds;
      this.armed = false;
      return event;
    }

    // Abort on slow drift.
    if (absV < this.thresholds.minVelocity * 0.3 && Math.abs(this.accumulatedDisplacement) < this.thresholds.minDisplacement) {
      this._state = "idle";
      this.armed = false;
      return null;
    }

    return null;
  }

  /** Replace calibration live (e.g. after recalibration). */
  setCalibration(cal: CalibrationData): void {
    this.calibration = cal;
  }

  /** Reset all internal state. */
  reset(): void {
    this.ySmoother.reset();
    this.velocityEstimator.reset();
    this._state = "idle";
    this.armed = true;
    this.cooldownEndT = 0;
    this.trackingStartT = 0;
    this.accumulatedDisplacement = 0;
    this.peakAbsV = 0;
    this.direction = null;
    this.lastTrackedY = 0;
    this.previousRawY = null;
  }

  /** Public state — 'cooldown' is folded into 'idle'. */
  get state(): "idle" | "tracking" {
    return this._state === "tracking" ? "tracking" : "idle";
  }
}
