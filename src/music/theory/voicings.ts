/**
 * Guitar voicings for standard tuning.  All voicings are root-position
 * open chords or moveable E-shape / A-shape barres.
 */

import { normalizeChordSymbol } from "./chords";

export type GuitarStringNote = {
  midi: number | null;
  muted?: boolean;
};

/** Standard tuning: E2 A2 D3 G3 B3 E4 (low E = index 0). */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

/** Conventional open-chord and barre voicings (low-E first, "x" = not played). */
const VOICING_MAP: Record<string, (number | "x")[]> = {
  // Open chords
  C: ["x", 3, 2, 0, 1, 0],
  Cm: ["x", 3, 5, 5, 4, 3],
  D: ["x", "x", 0, 2, 3, 2],
  Dm: ["x", "x", 0, 2, 3, 1],
  E: [0, 2, 2, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  F: [1, 3, 3, 2, 1, 1],
  Fm: [1, 3, 3, 1, 1, 1],
  G: [3, 2, 0, 0, 0, 3],
  Gm: [3, 5, 5, 3, 3, 3],
  A: ["x", 0, 2, 2, 2, 0],
  Am: ["x", 0, 2, 2, 1, 0],
  B: ["x", 2, 4, 4, 4, 2],
  Bm: ["x", 2, 4, 4, 3, 2],
  // E-shape barres (root on low E)
  "F#": [2, 4, 4, 3, 2, 2],
  "F#m": [2, 4, 4, 2, 2, 2],
  "G#": [4, 6, 6, 5, 4, 4],
  "G#m": [4, 6, 6, 4, 4, 4],
  "A#": [6, 8, 8, 7, 6, 6],
  "A#m": [6, 8, 8, 6, 6, 6],
  // A-shape barres (root on A string)
  "C#": ["x", 4, 6, 6, 6, 4],
  "C#m": ["x", 4, 6, 6, 5, 4],
  "D#": ["x", 6, 8, 8, 8, 6],
  "D#m": ["x", 6, 8, 8, 7, 6],
};

/** Return the fret pattern for a canonical chord symbol. */
export function getVoicingFrets(symbol: string): (number | "x")[] {
  const canonical = normalizeChordSymbol(symbol);
  const frets = VOICING_MAP[canonical];
  if (!frets) {
    throw new Error(`No voicing available for chord: "${symbol}"`);
  }
  return [...frets];
}

/**
 * Return the full string-by-string representation of a chord voicing,
 * including computed MIDI numbers for sounding strings.
 */
export function getVoicing(symbol: string): GuitarStringNote[] {
  const frets = getVoicingFrets(symbol);
  return frets.map((fret, stringIndex) => {
    if (fret === "x") {
      return { midi: null, muted: true };
    }
    const openMidi = STANDARD_TUNING[stringIndex];
    return { midi: openMidi + fret };
  });
}
