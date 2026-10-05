import type { TimeSignature } from "../performance/eventTypes";

/** One stroke in a strumming pattern. */
export interface StrumStep {
  /** Beat offset within the bar (0-based, quarter-note beats; fractions allowed). */
  beatOffset: number;
  direction: "down" | "up";
  /** Accent strokes are played harder and evaluated for direction only. */
  accent?: boolean;
}

export interface StrumPattern {
  id: string;
  name: string;
  /** Meters this pattern fits. */
  timeSignatures: TimeSignature[];
  /** Steps sorted by beatOffset. */
  steps: StrumStep[];
}

/** MVP song plan: exactly one chord per bar. */
export interface ChordProgression {
  bars: { chord: string }[];
}

export interface GuidedPlan {
  pattern: StrumPattern;
  progression: ChordProgression;
  /** Loop count is derived from progression length. */
}

/** Materialized expectation on the session timeline (t in seconds). */
export type ExpectedEvent =
  | {
      kind: "strum";
      t: number;
      direction: "down" | "up";
      accent: boolean;
      bar: number;
      beatInBar: number;
    }
  | {
      kind: "chord";
      t: number;
      chord: string;
      bar: number;
    };

export interface BarIssue {
  bar: number;
  message: string;
}

/** Aggregate feedback shown after a guided/song recording (PRODUCT_SPEC §10). */
export interface EvaluationResult {
  strumExpected: number;
  strumHit: number;
  directionCorrect: number;
  missedStrums: number;
  extraStrums: number;
  /** Mean absolute timing error of matched strums, milliseconds. */
  avgTimingErrorMs: number;
  /** Std-dev of matched strum timing errors, milliseconds. */
  timingSpreadMs: number;
  chordExpected: number;
  chordHit: number;
  /** Bars where the committed chord changed more than twice (unstable gesture). */
  unstableChordBars: number[];
  barIssues: BarIssue[];
}

export interface EvaluateOptions {
  /** Max |actual - expected| seconds for a strum to count as a hit. Default 0.15. */
  toleranceSeconds?: number;
}
