/**
 * Instrument preset contract. Presets tune the procedural Karplus–Strong
 * engine today; a future SampleGuitarEngine must honor the same ids.
 */

export interface InstrumentPreset {
  id: string;
  name: string;
  /** Target -60 dB decay of an open string, seconds. */
  decaySeconds: number;
  /** 0..1 excitation/loop brightness (lower = darker). */
  brightness: number;
  /** Base per-string spacing of a strum in ms at intensity 0.5. */
  strumSpacingMs: { down: number; up: number };
  /** How much intensity widens strum spacing (0 = constant). */
  spacingVelocityScale: number;
  /** Body resonance emphasis: subtle low-mid warmth via output EQ. */
  bodyGain: number;
}

export const INSTRUMENT_PRESETS: Record<string, InstrumentPreset> = {
  "acoustic-steel": {
    id: "acoustic-steel",
    name: "钢弦木吉他",
    decaySeconds: 3.2,
    brightness: 0.75,
    strumSpacingMs: { down: 11, up: 14 },
    spacingVelocityScale: 0.5,
    bodyGain: 0.25,
  },
  nylon: {
    id: "nylon",
    name: "尼龙弦吉他",
    decaySeconds: 2.4,
    brightness: 0.5,
    strumSpacingMs: { down: 13, up: 16 },
    spacingVelocityScale: 0.5,
    bodyGain: 0.35,
  },
  "clean-electric": {
    id: "clean-electric",
    name: "清音电吉他",
    decaySeconds: 4.5,
    brightness: 0.6,
    strumSpacingMs: { down: 9, up: 12 },
    spacingVelocityScale: 0.4,
    bodyGain: 0.15,
  },
};

export const DEFAULT_PRESET_ID = "acoustic-steel";

export function getPreset(id: string): InstrumentPreset {
  const preset = INSTRUMENT_PRESETS[id];
  if (!preset) throw new Error(`Unknown instrument preset: ${id}`);
  return preset;
}
