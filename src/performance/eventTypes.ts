/**
 * Stable domain event contracts (ARCHITECTURE.md §5, schemas/performance.schema.json).
 *
 * Every realtime module (vision, keyboard simulator, tests) emits these events
 * onto the performance bus; music/audio/recording modules consume only these
 * types and never import camera or MediaPipe modules.
 *
 * Time convention: `t` is seconds on the session clock (audio-context aligned
 * once audio is running). Recorded exports store `t` relative to record start.
 */

export type EventSource = "vision" | "keyboard" | "test";

export type StrumDirection = "down" | "up";

export type Articulation = "normal" | "muted";

/** Abstract hand role — never hardcode physical left/right as a musical role. */
export type HandRole = "chord" | "performance";

export type Handedness = "right" | "left";

export type PlayMode = "free" | "guided" | "song";

export type TimeSignature = "4/4" | "3/4" | "6/8";

export interface ChordEvent {
  type: "chord";
  t: number;
  /** Gesture-slot id (e.g. "slot-1") when the chord came from a slot mapping. */
  slot?: string;
  /** Chord symbol, e.g. "C", "Am", "F#m". */
  chord: string;
  confidence: number;
  source: EventSource;
}

export interface StrumEvent {
  type: "strum";
  t: number;
  direction: StrumDirection;
  /** Normalized speed of the stroke (calibration-relative, >= 0). */
  velocity: number;
  /** 0..1 dynamic intensity derived from velocity. */
  intensity: number;
  articulation: Articulation;
  source: EventSource;
}

export interface MuteEvent {
  type: "mute";
  t: number;
  active: boolean;
  source: EventSource;
}

export type ControlAction =
  | "ready"
  | "pause"
  | "resume"
  | "record-start"
  | "record-stop"
  | "stop"
  | "recalibrate";

export interface ControlEvent {
  type: "control";
  t: number;
  action: ControlAction;
  source: EventSource;
}

export type PerformanceEvent = ChordEvent | StrumEvent | MuteEvent | ControlEvent;

/** Settings carried into performance.json exports (schema-required subset). */
export interface SessionSettings {
  handedness: Handedness;
  mode: PlayMode;
  /** Musical key for Scale Mode, e.g. "C", "G". Null in pure Custom mode. */
  key: string | null;
  bpm: number;
  timeSignature: TimeSignature;
  instrumentPreset: string;
  /** Scale Mode maps gesture slots to diatonic roles; Custom maps slots to chord symbols. */
  chordMappingMode: "scale" | "custom";
  /** slot id -> chord symbol (custom mode). */
  customMapping?: Record<string, string>;
}

export const PERFORMANCE_JSON_VERSION = "1.0.0";
