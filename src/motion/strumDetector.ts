import type { CalibrationData, StrumThresholds } from "./calibrationTypes";
import { DEFAULT_CALIBRATION, DEFAULT_STRUM_THRESHOLDS } from "./calibrationTypes";
import type { StrumEvent } from "../performance/eventTypes";

export interface StrumDetectorOptions {
  thresholds?: Partial<StrumThresholds>;
  muted?: () => boolean;
}

/** One event per motion leg; a real reversal immediately arms the opposite stroke.
 * Use raw positions for displacement and a noise-derived reversal dead band rather
 * than a long velocity window that trails continuous up/down strumming. */
export class StrumDetector {
  private calibration: CalibrationData;
  private readonly options: StrumDetectorOptions;
  private readonly thresholds: StrumThresholds;
  private previousY: number | null = null;
  private previousT = -Infinity;
  private anchorY = 0;
  private extremeY = 0;
  private direction = 0;
  private fired = false;
  private lastFireT = -Infinity;
  private lastMovingT = -Infinity;
  private lastFastT = -Infinity;
  private peakAbsV = 0;
  private velocity = 0;
  private displacement = 0;

  constructor(calibration: CalibrationData = DEFAULT_CALIBRATION, options?: StrumDetectorOptions) {
    this.calibration = calibration;
    this.options = options ?? {};
    this.thresholds = { ...DEFAULT_STRUM_THRESHOLDS, ...options?.thresholds };
  }

  update(y: number | null, t: number): StrumEvent | null {
    if (y === null || !Number.isFinite(y) || !Number.isFinite(t)) {
      this.clearMotion();
      return null;
    }
    if (t <= this.previousT) return null;
    if (this.previousY === null || t - this.previousT > 0.3) {
      this.seed(y, t);
      return null;
    }
    const previousY = this.previousY;
    const dt = t - this.previousT;
    this.previousY = y;
    this.previousT = t;
    const scale = Math.max(0.01, this.calibration.handScale);
    const sensitivity = this.calibration.sensitivity;
    const factor = sensitivity / scale;
    const noise = Math.max(0, this.calibration.noiseFloor);
    const reversal = Math.max(0.08 * scale / sensitivity, noise * 2.5);
    const minimum = Math.max(this.thresholds.minDisplacement * scale / sensitivity, noise * 4);
    this.velocity = (y - previousY) / dt * factor;

    // Only a sustained rest re-arms the same direction. Merely drifting more
    // slowly after a stroke must not make a second event from the same sweep.
    if (Math.abs(this.velocity) >= this.thresholds.minVelocity * 0.5) this.lastMovingT = t;
    else if (t - this.lastMovingT >= 0.14) {
      this.anchorY = y;
      this.extremeY = y;
      this.direction = 0;
      this.fired = false;
      this.peakAbsV = 0;
      this.displacement = 0;
    }

    if (this.direction === 0) {
      if (Math.abs(y - this.anchorY) < reversal) return null;
      this.direction = y > this.anchorY ? 1 : -1;
      this.extremeY = y;
      this.fired = false;
    } else if ((y - this.extremeY) * this.direction < -reversal) {
      // Reversal starts at the last extremum, including movement between frames.
      this.anchorY = this.extremeY;
      this.direction *= -1;
      this.extremeY = y;
      this.fired = false;
      this.peakAbsV = 0;
      this.lastFastT = -Infinity;
    } else if ((y - this.extremeY) * this.direction > 0) {
      this.extremeY = y;
    }

    const speed = this.velocity * this.direction;
    if (speed >= this.thresholds.minVelocity) {
      this.lastFastT = t;
      this.peakAbsV = Math.max(this.peakAbsV, speed);
    }
    this.displacement = (y - this.anchorY) * factor;
    const corridor = this.calibration.strumCorridor;
    // Test the entire travelled segment: a quick stroke may skip the region
    // between two low-FPS frames and must still play.
    const touchesCorridor = Math.max(this.anchorY, y) >= corridor.topY &&
      Math.min(this.anchorY, y) <= corridor.bottomY;
    if (this.fired || !touchesCorridor || t - this.lastFireT < this.thresholds.cooldownSeconds ||
      t - this.lastFastT > 0.12 || (y - this.anchorY) * this.direction < minimum) return null;

    this.fired = true;
    this.lastFireT = t;
    return {
      type: "strum", t, direction: this.direction > 0 ? "down" : "up",
      velocity: this.peakAbsV,
      intensity: Math.max(0.15, Math.min(1, this.peakAbsV / this.thresholds.accentVelocity)),
      articulation: this.options.muted?.() ? "muted" : "normal", source: "vision",
    };
  }

  private seed(y: number, t: number): void {
    this.clearMotion();
    this.previousY = this.anchorY = this.extremeY = y;
    this.previousT = this.lastMovingT = t;
  }

  private clearMotion(): void {
    this.previousY = null;
    this.previousT = -Infinity;
    this.direction = 0;
    this.fired = false;
    this.velocity = this.displacement = this.peakAbsV = 0;
    this.lastFastT = this.lastMovingT = -Infinity;
  }

  setCalibration(calibration: CalibrationData): void {
    this.calibration = calibration;
    this.reset();
  }

  reset(): void {
    this.clearMotion();
    this.lastFireT = -Infinity;
  }

  get state(): "idle" | "tracking" {
    return this.direction !== 0 && !this.fired ? "tracking" : "idle";
  }

  get debug() {
    return { velocity: this.velocity, displacement: this.displacement, direction: this.direction,
      fired: this.fired, minimumDisplacement: Math.max(this.thresholds.minDisplacement,
        this.calibration.noiseFloor * 4 / this.calibration.handScale * this.calibration.sensitivity) };
  }
}
