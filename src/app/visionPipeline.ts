import type { EventBus } from "../performance/eventBus";
import type {
  ChordEvent,
  ControlEvent,
  Handedness,
  MuteEvent,
  StrumEvent,
} from "../performance/eventTypes";
import type { VisionFrame } from "../vision/types";
import { roleForPhysicalHand } from "../vision/types";
import { normalizeFrameHands } from "../vision/normalizeLandmarks";
import { HandIdentityTracker } from "../vision/handIdentityTracker";
import type { NormalizedHand, HandFeatures } from "../gesture/gestureTypes";
import { extractHandFeatures } from "../gesture/gestureFeatures";
import { ChordGestureRecognizer } from "../gesture/chordGestureRecognizer";
import { GestureDebouncer } from "../gesture/gestureDebouncer";
import { MuteDetector } from "../gesture/muteDetector";
import { ControlGestureRecognizer } from "../gesture/controlGestureRecognizer";
import { DEFAULT_SLOT_GESTURES } from "../gesture/gestureTypes";
import type { GestureCandidate, GestureId, SlotId } from "../gesture/gestureTypes";
import { StrumDetector } from "../motion/strumDetector";
import { Calibrator } from "../motion/calibration";
import type { CalibrationData } from "../motion/calibrationTypes";
import { DEFAULT_CALIBRATION, DEFAULT_DEBOUNCE_CONFIG } from "../motion/calibrationTypes";
import type { DebounceConfig } from "../motion/calibrationTypes";

export interface PipelineDebugStats {
  fps: number;
  inferenceMs: number;
  chordCandidate: GestureCandidate | null;
  committedGesture: GestureId | null;
  candidateProgress: number;
  performanceCandidate: GestureCandidate | null;
  muteActive: boolean;
  strumState: string;
  chordFingers: HandFeatures["extension"] | null;
  performanceFingers: HandFeatures["extension"] | null;
  strumMotion: StrumDetector["debug"];
  controlHold: { comboId: string; progress: number } | null;
  calibrationState: string;
  calibrationProgress: number;
}

export interface VisionPipelineOptions {
  handedness: Handedness;
  debounceConfig?: DebounceConfig;
  /** Maps a gesture slot to a chord symbol (settings-driven); null = unassigned. */
  resolveSlotChord: (slotId: string) => string | null;
  isRecording?: () => boolean;
  onCalibrationComplete?: (calibration: CalibrationData) => void;
  onCalibrationFailed?: (reason: string) => void;
}

const SLOT_BY_GESTURE = new Map<GestureId, SlotId>(
  (Object.entries(DEFAULT_SLOT_GESTURES) as [SlotId, GestureId][]).map(([slot, gesture]) => [
    gesture,
    slot,
  ]),
);

/**
 * Phase 5 integration: VisionFrame → normalized hands → gesture/motion
 * engines → performance bus events.
 *
 * Runs entirely outside React (driven by VisionClient's worker callback).
 *
 * Time convention: detectors use frame.t (vision clock, self-consistent);
 * published events are re-stamped with bus.now() so the session log and
 * audio scheduling share one epoch (the bus clock).
 */
export class VisionPipeline {
  private readonly bus: EventBus;
  private options: VisionPipelineOptions;

  private handedness: Handedness;
  private calibration: CalibrationData = DEFAULT_CALIBRATION;

  private readonly chordRecognizer = new ChordGestureRecognizer();
  private readonly handTracker = new HandIdentityTracker();
  private readonly debouncer: GestureDebouncer;
  private readonly strumDetector: StrumDetector;
  private readonly muteDetector = new MuteDetector();
  private readonly controlRecognizer: ControlGestureRecognizer;
  private _calibrator: Calibrator;
  private pendingCalibrationStart = false;
  private enabled = true;

  private lastChordEventChord: string | null = null;

  // Debug stats (polled by UI, not pushed).
  private frameTimes: number[] = [];
  private lastInferenceMs = 0;
  private lastChordCandidate: GestureCandidate | null = null;
  private lastPerfCandidate: GestureCandidate | null = null;
  private lastCandidateProgress = 0;
  private lastChordFingers: HandFeatures["extension"] | null = null;
  private lastPerfFingers: HandFeatures["extension"] | null = null;
  private lastStrumT = -Infinity;

  constructor(bus: EventBus, options: VisionPipelineOptions) {
    this.bus = bus;
    this.options = options;
    this.handedness = options.handedness;
    this.controlRecognizer = new ControlGestureRecognizer(undefined, options.isRecording);
    this.debouncer = new GestureDebouncer(options.debounceConfig ?? DEFAULT_DEBOUNCE_CONFIG);
    this.strumDetector = new StrumDetector(this.calibration, {
      muted: () => this.muteDetector.active,
    });
    this._calibrator = new Calibrator({ handedness: options.handedness });
  }

  /** Exposed for UI progress polling. Recreated on each beginCalibration(). */
  get calibrator(): Calibrator {
    return this._calibrator;
  }

  setHandedness(handedness: Handedness): void {
    if (this.handedness === handedness) return;
    this.handedness = handedness;
    this.reset();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.reset();
  }

  setCalibration(calibration: CalibrationData): void {
    this.calibration = calibration;
    this.strumDetector.setCalibration(calibration);
  }

  getCalibration(): CalibrationData {
    return this.calibration;
  }

  /**
   * Arm a new calibration window. The window actually opens on the next
   * vision frame so the calibrator's clock stays in the vision-time epoch
   * (bus.now() is a different epoch and must not be mixed in).
   */
  beginCalibration(sensitivity = 1): void {
    this._calibrator = new Calibrator({
      durationSeconds: 2.5,
      handedness: this.handedness,
      sensitivity,
    });
    this.pendingCalibrationStart = true;
  }

  /** Main entry: called by VisionClient for every processed frame. */
  handleFrame(frame: VisionFrame): void {
    this.lastInferenceMs = frame.inferenceMs;
    this.frameTimes.push(frame.t);
    if (this.frameTimes.length > 60) this.frameTimes.shift();

    if (this.pendingCalibrationStart) {
      this.pendingCalibrationStart = false;
      this._calibrator.begin(frame.t);
    }

    const hands = normalizeFrameHands(this.handTracker.update(frame.hands, frame.t), frame.t, frame.frameWidth / frame.frameHeight);

    // Calibration mode consumes frames and short-circuits performance logic.
    if (this._calibrator.state === "collecting") {
      this._calibrator.addHands(hands, frame.t);
      // addHands may transition state; read it back un-narrowed.
      const post: string = this._calibrator.state;
      if (post === "done") {
        const result = this._calibrator.result;
        if (result) {
          this.setCalibration(result);
          this.options.onCalibrationComplete?.(result);
        }
      } else if (post === "failed") {
        this.options.onCalibrationFailed?.(
          this._calibrator.failureReason ?? "Calibration failed.",
        );
      }
      return;
    }

    if (!this.enabled) return;

    let chordHand: NormalizedHand | null = null;
    let perfHand: NormalizedHand | null = null;
    for (const hand of hands) {
      const role = roleForPhysicalHand(hand.physical, this.handedness);
      if (role === "chord") chordHand = hand;
      else perfHand = hand;
    }

    const now = this.bus.now();

    // --- Chord hand: classify + debounce → ChordEvent ---
    const chordFeatures = chordHand ? extractHandFeatures(chordHand) : null;
    const chordCandidate = chordFeatures
      ? this.chordRecognizer.classify(chordFeatures)
      : null;
    this.lastChordCandidate = chordCandidate;
    this.lastChordFingers = chordFeatures?.extension ?? null;

    const debounce = this.debouncer.update(chordCandidate, frame.t);
    this.lastCandidateProgress = debounce.candidateProgress;
    if (debounce.changed && debounce.committed) {
      const slot = SLOT_BY_GESTURE.get(debounce.committed);
      const chord = slot ? this.options.resolveSlotChord(slot) : null;
      if (slot && chord && chord !== this.lastChordEventChord) {
        this.lastChordEventChord = chord;
        const event: ChordEvent = {
          type: "chord",
          t: now,
          slot,
          chord,
          confidence: chordCandidate?.confidence ?? 1,
          source: "vision",
        };
        this.bus.publish(event);
      }
    }

    // --- Performance hand: strum motion + mute pose ---
    const perfFeatures = perfHand ? extractHandFeatures(perfHand) : null;
    const perfCandidate = perfFeatures ? this.chordRecognizer.classify(perfFeatures) : null;
    this.lastPerfCandidate = perfCandidate;
    this.lastPerfFingers = perfFeatures?.extension ?? null;

    const muteEvent = this.muteDetector.update(perfCandidate, frame.t);
    if (muteEvent) {
      const event: MuteEvent = { ...muteEvent, t: now };
      this.bus.publish(event);
    }

    const strum = this.strumDetector.update(
      perfHand ? (perfHand.strumPointRaw ?? perfHand.palmCenterRaw).y : null,
      frame.t,
    );
    if (strum) {
      this.lastStrumT = frame.t;
      const event: StrumEvent = { ...strum, t: now };
      this.bus.publish(event);
    }

    // --- Two-hand control gestures ---
    // Playing G with an open strumming hand must not hold the two-open-palms
    // stop combo. System holds only accumulate after strumming settles.
    const moving = Math.abs(this.strumDetector.debug.velocity) > 0.75 || frame.t - this.lastStrumT < 0.5;
    const control = this.controlRecognizer.update(moving ? null : chordCandidate, moving ? null : perfCandidate, frame.t);
    if (control) {
      const event: ControlEvent = { ...control, t: now };
      this.bus.publish(event);
    }
  }

  /** Polled by debug UI at its own cadence. */
  getDebugStats(): PipelineDebugStats {
    const now = this.frameTimes[this.frameTimes.length - 1] ?? 0;
    const windowStart = now - 1;
    const fps = this.frameTimes.filter((t) => t >= windowStart).length;
    return {
      fps,
      inferenceMs: this.lastInferenceMs,
      chordCandidate: this.lastChordCandidate,
      committedGesture: this.debouncer.committed,
      candidateProgress: this.lastCandidateProgress,
      performanceCandidate: this.lastPerfCandidate,
      muteActive: this.muteDetector.active,
      strumState: this.strumDetector.state,
      chordFingers: this.lastChordFingers,
      performanceFingers: this.lastPerfFingers,
      strumMotion: this.strumDetector.debug,
      controlHold: this.controlRecognizer.holdProgress,
      calibrationState: this.calibrator.state,
      calibrationProgress: this.calibrator.progress,
    };
  }

  reset(): void {
    // Releasing/resetting the detector must release the corresponding audio mute.
    if (this.muteDetector.active) {
      this.bus.publish({ type: "mute", t: this.bus.now(), active: false, source: "vision" });
    }
    this.pendingCalibrationStart = false;
    this._calibrator.reset();
    this.debouncer.reset();
    this.handTracker.reset();
    this.strumDetector.reset();
    this.muteDetector.reset();
    this.controlRecognizer.reset();
    this.lastChordEventChord = null;
    this.lastStrumT = -Infinity;
    this.lastChordFingers = this.lastPerfFingers = null;
    this.frameTimes = [];
  }
}
