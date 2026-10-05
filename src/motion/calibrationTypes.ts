/**
 * Calibration contracts (GESTURE_SPEC §9, PRODUCT_SPEC §7).
 * All motion thresholds derive from these normalized, calibration-relative
 * values — never raw pixels.
 */

import type { Point3 } from "../vision/types";

export interface StrumCorridor {
  /** Image-normalized y (down-positive) of the corridor top edge. */
  topY: number;
  /** Image-normalized y of the corridor bottom edge. */
  bottomY: number;
  /** Neutral resting y for the performance hand. */
  neutralY: number;
}

export interface CalibrationData {
  version: 1;
  calibratedAt: string;
  /** Mean hand scale (wrist -> middle MCP, image-normalized units) across both hands. */
  handScale: number;
  /** Std-dev of wrist position while the user holds still = baseline motion noise. */
  noiseFloor: number;
  /** Baseline wrist positions per role (raw image-normalized). */
  chordHandNeutral: Point3 | null;
  performanceHandNeutral: Point3 | null;
  /** Strum activation region for the performance hand. */
  strumCorridor: StrumCorridor;
  /** User sensitivity multiplier (0.25..3), scales velocity thresholds. */
  sensitivity: number;
}

/** Sensible pre-calibration defaults so keyboard mode and first-run work. */
export const DEFAULT_CALIBRATION: CalibrationData = {
  version: 1,
  calibratedAt: "",
  handScale: 0.2,
  noiseFloor: 0.005,
  chordHandNeutral: null,
  performanceHandNeutral: null,
  strumCorridor: { topY: 0.35, bottomY: 0.75, neutralY: 0.55 },
  sensitivity: 1,
};

/** Tunable strum-detection thresholds, scaled by calibration at runtime. */
export interface StrumThresholds {
  /** Minimum normalized vertical speed (units of handScale per second... see detector). */
  minVelocity: number;
  /** Minimum vertical displacement (fraction of handScale) for a valid stroke. */
  minDisplacement: number;
  /** Refractory period after a strum before the next can fire (seconds). */
  cooldownSeconds: number;
  /** Velocity (handScale/s) mapped to intensity 1.0. */
  accentVelocity: number;
}

export const DEFAULT_STRUM_THRESHOLDS: StrumThresholds = {
  minVelocity: 1.5,
  minDisplacement: 0.6,
  cooldownSeconds: 0.09,
  accentVelocity: 6,
};

/** Tunable chord debounce parameters (GESTURE_SPEC §4). */
export interface DebounceConfig {
  /** Candidate must dominate this long before commit (seconds). */
  commitSeconds: number;
  /** Recognition dropouts shorter than this keep the committed chord (seconds). */
  retentionSeconds: number;
  /** Minimum classifier confidence to accept a candidate. */
  minConfidence: number;
}

export const DEFAULT_DEBOUNCE_CONFIG: DebounceConfig = {
  commitSeconds: 0.16,
  retentionSeconds: 0.4,
  minConfidence: 0.6,
};
