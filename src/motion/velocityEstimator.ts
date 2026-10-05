import { ExponentialSmoother } from "./motionSmoother";

interface Sample {
  t: number;
  y: number;
}

/**
 * Least-squares velocity estimator with exponential smoothing.
 *
 * Tuning:
 * - windowSeconds = 0.06 s (~4 frames at 60 Hz) — wide enough to suppress
 *   single-frame jitter, narrow enough to keep latency low.
 * - smoothingAlpha = 0.5 — additional pole on the raw slope estimate.
 */
export class VelocityEstimator {
  private readonly windowSeconds: number;
  private readonly smoother: ExponentialSmoother;
  private samples: Sample[] = [];

  constructor(options?: { windowSeconds?: number; smoothingAlpha?: number }) {
    this.windowSeconds = options?.windowSeconds ?? 0.06;
    this.smoother = new ExponentialSmoother(options?.smoothingAlpha ?? 0.5);
  }

  /** Append a new (t, y) pair. Out-of-order samples are discarded. */
  addSample(t: number, y: number): void {
    if (this.samples.length > 0 && t < this.samples[this.samples.length - 1].t) {
      return;
    }
    this.samples.push({ t, y });
    const cutoff = t - this.windowSeconds;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  /** Raw dy/dt (units of y per second), smoothed. */
  get velocity(): number {
    const v = this.computeSlope();
    return this.smoother.update(v);
  }

  /** Clear the sample window and smoothing state. */
  reset(): void {
    this.samples = [];
    this.smoother.reset();
  }

  private computeSlope(): number {
    const n = this.samples.length;
    if (n < 2) return 0;
    if (n === 2) {
      const [a, b] = this.samples;
      return (b.y - a.y) / (b.t - a.t);
    }
    // Offset by first sample's t for numerical stability.
    const t0 = this.samples[0].t;
    let sumT = 0;
    let sumY = 0;
    let sumTY = 0;
    let sumT2 = 0;
    for (const s of this.samples) {
      const dt = s.t - t0;
      sumT += dt;
      sumY += s.y;
      sumTY += dt * s.y;
      sumT2 += dt * dt;
    }
    const denom = n * sumT2 - sumT * sumT;
    if (Math.abs(denom) < 1e-12) return 0;
    return (n * sumTY - sumT * sumY) / denom;
  }
}
