import type { VisionTier } from "./types";

/**
 * Compute the arithmetic mean of an array of numbers.
 * @param samples - array of numeric samples
 * @returns the average, or 0 for an empty array
 */
export function movingAverage(samples: number[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

/**
 * Pure controller that steps vision quality up or down based on inference
 * wall-time samples. Uses a moving average over a fixed window and
 * enforces a cooldown between tier changes to prevent flapping.
 */
export class AdaptiveTierController {
  private readonly windowSize: number;
  private readonly overloadMs: number;
  private readonly cooldownSeconds: number;
  private readonly startTier: VisionTier["id"];
  private samples: number[] = [];
  private lastChangeTimeSeconds = -Infinity;
  private fastStreak = 0;
  private _currentTier: VisionTier["id"];

  constructor(options?: {
    windowSize?: number;
    overloadMs?: number;
    cooldownSeconds?: number;
    startTier?: VisionTier["id"];
  }) {
    this.windowSize = options?.windowSize ?? 20;
    this.overloadMs = options?.overloadMs ?? 50;
    this.cooldownSeconds = options?.cooldownSeconds ?? 4;
    this.startTier = options?.startTier ?? "medium";
    this._currentTier = this.startTier;
  }

  /** The currently selected tier id. */
  get currentTier(): VisionTier["id"] {
    return this._currentTier;
  }

  /**
   * Record a new inference timing and re-evaluate the tier.
   * @param inferenceMs - wall-clock inference duration
   * @param tSeconds - monotonic time in seconds
   */
  addSample(inferenceMs: number, tSeconds: number): void {
    this.samples.push(inferenceMs);
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }

    if (this.samples.length < this.windowSize) {
      return;
    }

    const avg = movingAverage(this.samples);
    const timeSinceChange = tSeconds - this.lastChangeTimeSeconds;

    if (timeSinceChange < this.cooldownSeconds) {
      return;
    }

    const order: VisionTier["id"][] = ["low", "medium", "high"];
    const idx = order.indexOf(this._currentTier);

    if (avg > this.overloadMs) {
      if (idx > 0) {
        this._currentTier = order[idx - 1];
        this.lastChangeTimeSeconds = tSeconds;
        this.fastStreak = 0;
      }
    } else if (avg < this.overloadMs * 0.5) {
      this.fastStreak++;
      if (this.fastStreak >= this.windowSize && idx < order.length - 1) {
        this._currentTier = order[idx + 1];
        this.lastChangeTimeSeconds = tSeconds;
        this.fastStreak = 0;
      }
    } else {
      this.fastStreak = 0;
    }
  }

  /** Reset all state back to defaults. */
  reset(): void {
    this.samples = [];
    this.lastChangeTimeSeconds = -Infinity;
    this.fastStreak = 0;
    this._currentTier = this.startTier;
  }

  /**
   * Adopt an externally applied tier and clear measurement state. Must be
   * called whenever the owner changes tiers — otherwise the controller's
   * stale tier immediately disagrees with the owner's and every upgrade is
   * reverted on the next sample (a flap loop).
   */
  sync(id: VisionTier["id"]): void {
    this.samples = [];
    this.fastStreak = 0;
    this._currentTier = id;
  }
}
