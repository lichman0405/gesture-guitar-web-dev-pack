/**
 * Single-pole exponential smoother.
 *
 * Tuning: default alpha = 0.5 provides a balanced trade-off between
 * noise suppression and lag for 60 Hz vision input.
 */
export class ExponentialSmoother {
  private _value: number | null = null;
  private readonly alpha: number;

  constructor(alpha?: number) {
    this.alpha = alpha ?? 0.5;
  }

  /**
   * Feed a new sample and return the smoothed value.
   * The very first sample initializes the internal state.
   */
  update(value: number): number {
    if (this._value === null) {
      this._value = value;
    } else {
      this._value = this.alpha * value + (1 - this.alpha) * this._value;
    }
    return this._value;
  }

  /**
   * Reset internal state. If a value is supplied it becomes the new state;
   * otherwise the smoother is returned to its pre-first-sample condition.
   */
  reset(value?: number): void {
    this._value = value ?? null;
  }

  /** Current smoothed value, or null before the first sample. */
  get value(): number | null {
    return this._value;
  }
}
