import type { GestureCandidate, GestureId } from "./gestureTypes";
import type { DebounceConfig } from "../motion/calibrationTypes";
import { DEFAULT_DEBOUNCE_CONFIG } from "../motion/calibrationTypes";

/**
 * Result of a single debouncer update.
 */
export interface DebounceUpdate {
  /** Currently committed gesture, or null if none. */
  committed: GestureId | null;
  /** True exactly when `committed` changes this frame. */
  changed: boolean;
  /** Gesture currently being evaluated for commit (null if none pending). */
  candidate: GestureId | null;
  /** Progress of the pending candidate toward commit, 0..1. */
  candidateProgress: number;
}

/**
 * Hysteresis state machine for chord-gesture debounce.
 *
 * A candidate must be observed continuously for {@link DebounceConfig.commitSeconds}
 * before it commits. Once committed, the gesture is retained for
 * {@link DebounceConfig.retentionSeconds} after recognition dropout (null candidate),
 * unless the same gesture reappears (canceling dropout) or a different gesture
 * commits first.
 */
export class GestureDebouncer {
  private readonly _config: DebounceConfig;
  private _committed: GestureId | null = null;
  private _candidateId: GestureId | null = null;
  private _candidateStartTime = 0;
  private _dropoutAccumulated = 0;
  private _dropoutStartTime: number | null = null;
  private _lastTime = -Infinity;

  /**
   * @param config Debounce parameters. Defaults to {@link DEFAULT_DEBOUNCE_CONFIG}.
   */
  constructor(config: DebounceConfig = DEFAULT_DEBOUNCE_CONFIG) {
    this._config = config;
  }

  /** The currently committed gesture, or null. */
  get committed(): GestureId | null {
    return this._committed;
  }

  /**
   * Clear committed value and all internal timers.
   */
  reset(): void {
    this._committed = null;
    this._candidateId = null;
    this._candidateStartTime = 0;
    this._dropoutAccumulated = 0;
    this._dropoutStartTime = null;
    this._lastTime = -Infinity;
  }

  /**
   * Process one vision frame.
   *
   * @param candidate Classifier output for this frame, or null.
   * @param t Monotonic time in seconds.
   * @returns The debounced state after this frame.
   */
  update(candidate: GestureCandidate | null, t: number): DebounceUpdate {
    if (t < this._lastTime) {
      // Monotonic-time safety: reset timers without throwing.
      this._candidateId = null;
      this._candidateStartTime = 0;
      this._dropoutAccumulated = 0;
      this._dropoutStartTime = null;
      this._lastTime = t;
    }

    this._lastTime = t;

    const effective: GestureId | null =
      candidate && candidate.confidence >= this._config.minConfidence
        ? candidate.gestureId
        : null;

    // Same gesture reappears: cancel dropout and candidate timers.
    if (effective === this._committed) {
      this._candidateId = null;
      this._dropoutAccumulated = 0;
      this._dropoutStartTime = null;
      return {
        committed: this._committed,
        changed: false,
        candidate: null,
        candidateProgress: 0,
      };
    }

    // Valid candidate different from committed.
    if (effective !== null) {
      // Finalize any active dropout block so accumulated null time is preserved
      // in case dropout resumes later.
      if (this._dropoutStartTime !== null) {
        this._dropoutAccumulated += t - this._dropoutStartTime;
        this._dropoutStartTime = null;
      }

      if (this._committed === null) {
        this._dropoutAccumulated = 0;
      }

      let changed = false;
      let progress = 0;

      if (effective === this._candidateId) {
        const elapsed = t - this._candidateStartTime;
        if (elapsed >= this._config.commitSeconds) {
          this._committed = effective;
          this._candidateId = null;
          this._dropoutAccumulated = 0;
          changed = true;
          progress = 1;
        } else {
          progress = Math.min(1, elapsed / this._config.commitSeconds);
        }
      } else {
        this._candidateId = effective;
        this._candidateStartTime = t;
        progress = 0;
      }

      return {
        committed: this._committed,
        changed,
        candidate: changed ? null : effective,
        candidateProgress: progress,
      };
    }

    // effective === null: recognition dropout.
    this._candidateId = null;

    if (this._committed === null) {
      this._dropoutAccumulated = 0;
      this._dropoutStartTime = null;
      return {
        committed: null,
        changed: false,
        candidate: null,
        candidateProgress: 0,
      };
    }

    // Start or continue the current null block.
    if (this._dropoutStartTime === null) {
      this._dropoutStartTime = t;
    }

    const currentBlock = t - this._dropoutStartTime;
    const totalDropout = this._dropoutAccumulated + currentBlock;

    if (totalDropout >= this._config.retentionSeconds) {
      this._committed = null;
      this._dropoutAccumulated = 0;
      this._dropoutStartTime = null;
      return {
        committed: null,
        changed: true,
        candidate: null,
        candidateProgress: 0,
      };
    }

    return {
      committed: this._committed,
      changed: false,
      candidate: null,
      candidateProgress: 0,
    };
  }
}
