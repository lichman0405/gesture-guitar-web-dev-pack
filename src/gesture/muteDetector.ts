/**
 * MuteDetector converts a stream of per-frame gesture candidates for the
 * performance hand into stable MuteEvent edges.
 *
 * A continuous fist (MUTE_GESTURE) held for at least `activateSeconds`
 * activates mute. Returning to a non-fist (or absent hand) for at least
 * `releaseSeconds` deactivates it. Brief flicker shorter than either window
 * is ignored.
 */

import { MUTE_GESTURE } from "./gestureTypes";
import type { GestureCandidate } from "./gestureTypes";
import type { MuteEvent } from "../performance/eventTypes";

export interface MuteDetectorOptions {
  /** Seconds of continuous fist required to activate mute. Default 0.12. */
  activateSeconds?: number;
  /** Seconds of continuous non-fist required to release mute. Default 0.2. */
  releaseSeconds?: number;
}

export class MuteDetector {
  private readonly activateSeconds: number;
  private readonly releaseSeconds: number;
  private _active = false;
  private _fistStart: number | null = null;
  private _nonFistStart: number | null = null;

  constructor(options: MuteDetectorOptions = {}) {
    this.activateSeconds = options.activateSeconds ?? 0.12;
    this.releaseSeconds = options.releaseSeconds ?? 0.2;
  }

  /** Whether mute is currently active. */
  get active(): boolean {
    return this._active;
  }

  /**
   * Process a new vision frame.
   *
   * @param candidate Gesture candidate for the performance hand, or null.
   * @param t Session time in seconds.
   * @returns A MuteEvent on state change, otherwise null.
   */
  update(candidate: GestureCandidate | null, t: number): MuteEvent | null {
    const isFist =
      candidate?.gestureId === MUTE_GESTURE && candidate.confidence >= 0.6;

    if (isFist) {
      if (this._fistStart === null) {
        this._fistStart = t;
      }
      this._nonFistStart = null;

      if (!this._active && t - this._fistStart >= this.activateSeconds) {
        this._active = true;
        return { type: "mute", t, active: true, source: "vision" };
      }
    } else {
      if (this._nonFistStart === null) {
        this._nonFistStart = t;
      }
      this._fistStart = null;

      if (this._active && t - this._nonFistStart >= this.releaseSeconds) {
        this._active = false;
        return { type: "mute", t, active: false, source: "vision" };
      }
    }

    return null;
  }

  /** Reset all internal state; mute becomes inactive. */
  reset(): void {
    this._active = false;
    this._fistStart = null;
    this._nonFistStart = null;
  }
}
