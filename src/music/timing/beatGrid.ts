import type { TimeSignature } from "../../performance/eventTypes";

export interface MeterSpec {
  beatsPerBar: number;
  /** Denominator: 4 = quarter-note beat, 8 = eighth-note beat. */
  beatUnit: 4 | 8;
}

export function meterFromSignature(signature: TimeSignature): MeterSpec {
  switch (signature) {
    case "4/4":
      return { beatsPerBar: 4, beatUnit: 4 };
    case "3/4":
      return { beatsPerBar: 3, beatUnit: 4 };
    case "6/8":
      return { beatsPerBar: 6, beatUnit: 8 };
  }
}

export function beatDurationSeconds(bpm: number, meter: MeterSpec): number {
  return (60 / bpm) * (4 / meter.beatUnit);
}

export interface BeatPosition {
  /** Absolute beat index since grid start (including count-in). */
  beatIndex: number;
  /** Musical bar, 0-based; negative during count-in. */
  bar: number;
  /** Beat within the bar, 0-based. */
  beatInBar: number;
  inCountIn: boolean;
  /** 0..1 progress through the current beat. */
  beatPhase: number;
}

/**
 * Pure musical-time math: maps between transport time (seconds) and
 * bar/beat positions for a fixed bpm/meter/count-in. No Web Audio usage —
 * fully unit-testable in node.
 */
export class BeatGrid {
  readonly bpm: number;
  readonly signature: TimeSignature;
  readonly countInBars: number;

  constructor(bpm: number, signature: TimeSignature, countInBars = 1) {
    if (!(bpm >= 40 && bpm <= 240)) throw new Error(`bpm out of range: ${bpm}`);
    this.bpm = bpm;
    this.signature = signature;
    this.countInBars = Math.max(0, Math.round(countInBars));
  }

  get meter(): MeterSpec {
    return meterFromSignature(this.signature);
  }

  get beatDuration(): number {
    return beatDurationSeconds(this.bpm, this.meter);
  }

  get beatsPerBar(): number {
    return this.meter.beatsPerBar;
  }

  get countInBeats(): number {
    return this.countInBars * this.beatsPerBar;
  }

  /** Seconds from grid origin to the start of the given absolute beat. */
  beatTime(absoluteBeatIndex: number): number {
    return absoluteBeatIndex * this.beatDuration;
  }

  /** Seconds from grid origin to musical beat 0 (end of count-in). */
  get musicStartTime(): number {
    return this.beatTime(this.countInBeats);
  }

  isCountInBeat(absoluteBeatIndex: number): boolean {
    return absoluteBeatIndex < this.countInBeats;
  }

  /** Bar/beat for a musical beat index (0 = first beat of bar 0). */
  barBeatAt(musicalBeatIndex: number): { bar: number; beatInBar: number } {
    const bar = Math.floor(musicalBeatIndex / this.beatsPerBar);
    const beatInBar = musicalBeatIndex - bar * this.beatsPerBar;
    return { bar, beatInBar };
  }

  positionAt(timeSeconds: number): BeatPosition {
    const raw = timeSeconds / this.beatDuration;
    const beatIndex = Math.floor(raw);
    const beatPhase = raw - beatIndex;
    const musical = beatIndex - this.countInBeats;
    const inCountIn = musical < 0;
    const { bar, beatInBar } = inCountIn
      ? { bar: -Math.ceil(-musical / this.beatsPerBar), beatInBar: ((musical % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar }
      : this.barBeatAt(musical);
    return { beatIndex, bar, beatInBar, inCountIn, beatPhase };
  }

  /** Accent pattern: beat 0 strong; in 6/8 beat 3 medium. */
  accentLevel(beatInBar: number): "strong" | "medium" | "weak" {
    if (beatInBar === 0) return "strong";
    if (this.signature === "6/8" && beatInBar === 3) return "medium";
    return "weak";
  }
}
