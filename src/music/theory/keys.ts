/**
 * Major-key diatonic chord mappings for scale-mode gesture slots.
 */

import { normalizeChordSymbol, type ChordQuality } from "./chords";
import { SLOT_IDS } from "../../gesture/gestureTypes";

/** The 12 major keys, expressed with sharp canonical roots. */
export const MAJOR_KEYS: string[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** Diatonic scale-degree roles in a major key (Nashville-style). */
export const SCALE_SLOT_ORDER = ["I", "ii", "iii", "IV", "V", "vi"] as const;

/** Stable slot IDs that correspond to the scale-degree roles. */
export const SCALE_SLOT_IDS = [...SLOT_IDS];

const SCALE_DEGREES = [0, 2, 4, 5, 7, 9];
const SCALE_QUALITIES: ChordQuality[] = [
  "maj",
  "min",
  "min",
  "maj",
  "maj",
  "min",
];

/** Build the diatonic chord symbol for a given major-key root and scale degree. */
function diatonicChord(root: string, degreeIndex: number): string {
  const rootPc = MAJOR_KEYS.indexOf(root);
  if (rootPc === -1) {
    throw new Error(`Invalid major key root: "${root}"`);
  }
  const degreePc = (rootPc + SCALE_DEGREES[degreeIndex]) % 12;
  const chordRoot = MAJOR_KEYS[degreePc];
  const quality = SCALE_QUALITIES[degreeIndex];
  return quality === "min" ? `${chordRoot}m` : chordRoot;
}

/**
 * Return the diatonic chords for a major key, keyed by Roman-numeral role.
 * Flat key aliases are normalised to sharps automatically.
 */
export function diatonicChords(keyRoot: string): Record<string, string> {
  const normalized = normalizeChordSymbol(keyRoot);
  const root = normalized.endsWith("m") ? normalized.slice(0, -1) : normalized;
  const result: Record<string, string> = {};
  for (let i = 0; i < SCALE_SLOT_ORDER.length; i++) {
    result[SCALE_SLOT_ORDER[i]] = diatonicChord(root, i);
  }
  return result;
}

/**
 * Return the diatonic chords for a major key, keyed by gesture slot ID.
 * Flat key aliases are normalised to sharps automatically.
 */
export function scaleModeMapping(keyRoot: string): Record<string, string> {
  const chords = diatonicChords(keyRoot);
  const result: Record<string, string> = {};
  for (let i = 0; i < SCALE_SLOT_ORDER.length; i++) {
    result[SCALE_SLOT_IDS[i]] = chords[SCALE_SLOT_ORDER[i]];
  }
  // Common secondary/borrowed chords alongside the original six scale slots:
  // II, III, i, bVII. Custom mode can assign any of the 24 major/minor chords.
  const root = normalizeChordSymbol(keyRoot).replace(/m$/, "");
  const rootPc = MAJOR_KEYS.indexOf(root);
  [2, 4, 0, 10].forEach((offset, index) => {
    result[SCALE_SLOT_IDS[index + 6]] = MAJOR_KEYS[(rootPc + offset) % 12] + (index === 2 ? "m" : "");
  });
  return result;
}
