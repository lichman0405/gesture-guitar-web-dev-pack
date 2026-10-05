/**
 * ControlGestureRecognizer detects two-hand control combos.
 *
 * A combo is recognized only when **both** the chord hand and the performance
 * hand simultaneously match the combo's gestures with confidence >= 0.6.
 * Single-hand matches are ignored — there is no special-casing beyond the
 * two-hand rule.
 *
 * Once a combo holds continuously for its `holdSeconds`, a single
 * ControlEvent is emitted. The combo must then stop matching for at least
 * 0.5 s before it can re-arm (edge-triggered behaviour).
 */

import type { GestureCandidate, GestureId } from "./gestureTypes";
import type { ControlAction, ControlEvent } from "../performance/eventTypes";

export interface ControlCombo {
  id: string;
  chordHand: GestureId;
  performanceHand: GestureId;
  holdSeconds: number;
  action: ControlAction | "toggle-record" | "toggle-pause";
}

export const DEFAULT_CONTROL_COMBOS: ControlCombo[] = [
  {
    id: "ready",
    chordHand: "thumbs-up",
    performanceHand: "thumbs-up",
    holdSeconds: 1.2,
    action: "ready",
  },
  {
    id: "toggle-pause",
    chordHand: "fist",
    performanceHand: "fist",
    holdSeconds: 1.5,
    action: "toggle-pause",
  },
  {
    id: "toggle-record",
    chordHand: "ok-sign",
    performanceHand: "ok-sign",
    holdSeconds: 1.5,
    action: "toggle-record",
  },
  {
    id: "stop",
    chordHand: "open-palm",
    performanceHand: "open-palm",
    holdSeconds: 2.0,
    action: "stop",
  },
];

export class ControlGestureRecognizer {
  private readonly combos: ControlCombo[];
  private _trackId: string | null = null;
  private _trackStart: number | null = null;
  private _trackFired = false;
  private _cooldownUntil = new Map<string, number>();
  private _nextRecordAction: ControlAction = "record-start";
  private _nextPauseAction: ControlAction = "pause";
  private _lastT = 0;

  constructor(combos: ControlCombo[] = DEFAULT_CONTROL_COMBOS,
    private readonly isRecording?: () => boolean) {
    this.combos = combos;
  }

  /**
   * Current hold progress for UI countdown display.
   *
   * @returns The active combo id and progress in 0..1, or null when nothing
   *   is currently matching.
   */
  get holdProgress(): { comboId: string; progress: number } | null {
    if (this._trackId === null || this._trackStart === null) {
      return null;
    }
    const combo = this.combos.find((c) => c.id === this._trackId);
    if (!combo) {
      return null;
    }
    const progress = Math.min(
      1,
      (this._lastT - this._trackStart) / combo.holdSeconds,
    );
    return { comboId: this._trackId, progress };
  }

  /**
   * Process new vision frames for both hands.
   *
   * @param chordCandidate Gesture candidate for the chord hand, or null.
   * @param performanceCandidate Gesture candidate for the performance hand, or null.
   * @param t Session time in seconds.
   * @returns A ControlEvent when a combo fires, otherwise null.
   */
  update(
    chordCandidate: GestureCandidate | null,
    performanceCandidate: GestureCandidate | null,
    t: number,
  ): ControlEvent | null {
    this._lastT = t;

    const match = this.findMatchingCombo(chordCandidate, performanceCandidate);

    // If the currently tracked combo stopped matching, start cooldown.
    if (this._trackId !== null) {
      if (match?.id !== this._trackId) {
        if (this._trackFired) {
          this._cooldownUntil.set(this._trackId, t + 0.5);
        }
        this._trackId = null;
        this._trackStart = null;
        this._trackFired = false;
      }
    }

    // Start tracking a new match if not in cooldown.
    if (this._trackId === null) {
      if (match) {
        const cooldownEnd = this._cooldownUntil.get(match.id);
        if (cooldownEnd === undefined || t >= cooldownEnd) {
          this._trackId = match.id;
          this._trackStart = t;
          this._trackFired = false;
        }
      }
    }

    // Check whether the tracked combo has reached its hold threshold.
    if (this._trackId !== null && !this._trackFired && this._trackStart !== null) {
      const combo = this.combos.find((c) => c.id === this._trackId)!;
      if (t - this._trackStart >= combo.holdSeconds) {
        this._trackFired = true;
        const action = this.resolveAction(combo.action);

        if (combo.action === "toggle-record") {
          this._nextRecordAction =
            this._nextRecordAction === "record-start"
              ? "record-stop"
              : "record-start";
        } else if (combo.action === "toggle-pause") {
          this._nextPauseAction =
            this._nextPauseAction === "pause" ? "resume" : "pause";
        }

        return { type: "control", t, action, source: "vision" };
      }
    }

    return null;
  }

  /** Reset all internal state, including toggle alternation and cooldowns. */
  reset(): void {
    this._trackId = null;
    this._trackStart = null;
    this._trackFired = false;
    this._cooldownUntil.clear();
    this._nextRecordAction = "record-start";
    this._nextPauseAction = "pause";
    this._lastT = 0;
  }

  private findMatchingCombo(
    chord: GestureCandidate | null,
    perf: GestureCandidate | null,
  ): ControlCombo | undefined {
    if (!chord || !perf) {
      return undefined;
    }
    if (chord.confidence < 0.6 || perf.confidence < 0.6) {
      return undefined;
    }
    return this.combos.find(
      (c) => c.chordHand === chord.gestureId && c.performanceHand === perf.gestureId,
    );
  }

  private resolveAction(
    action: ControlAction | "toggle-record" | "toggle-pause",
  ): ControlAction {
    if (action === "toggle-record") {
      if (this.isRecording) return this.isRecording() ? "record-stop" : "record-start";
      return this._nextRecordAction;
    }
    if (action === "toggle-pause") {
      return this._nextPauseAction;
    }
    return action;
  }
}
