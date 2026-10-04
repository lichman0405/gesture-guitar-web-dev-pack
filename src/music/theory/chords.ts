/**
 * Chord symbol parsing, canonical pitch-class utilities, and chord-tone
 * computation.  All pitch classes use sharp names.
 */

const SHARP_NAMES = [
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
] as const;

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
  "E#": "F",
  Fb: "E",
  "B#": "C",
  Cb: "B",
};

const NOTE_LETTERS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Map a note name (sharp or flat) to its pitch class 0-11. */
function nameToPc(name: string): number {
  if (name.length < 1 || name.length > 2) {
    throw new Error(`Invalid note name: "${name}"`);
  }
  const letter = name[0] as string;
  const letterPc = NOTE_LETTERS[letter];
  if (letterPc === undefined) {
    throw new Error(`Invalid note name: "${name}"`);
  }
  const accidental = name[1];
  if (accidental === undefined) return letterPc;
  if (accidental === "#") return (letterPc + 1) % 12;
  if (accidental === "b") return (letterPc + 11) % 12;
  throw new Error(`Invalid note name: "${name}"`);
}

/** Normalize a note name to its sharp canonical form. */
function normalizeNoteName(name: string): string {
  const sharp = FLAT_TO_SHARP[name];
  if (sharp) return sharp;
  if (SHARP_NAMES.includes(name as (typeof SHARP_NAMES)[number])) return name;
  // Validate by converting to PC and back.
  const pc = nameToPc(name);
  return SHARP_NAMES[pc];
}

/** Convert a note name with octave (e.g. "E2", "C#4") to MIDI note number. */
export function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-Ga-g](?:#|b)?)(-?\d+)$/);
  if (!match) {
    throw new Error(`Invalid note name: "${name}"`);
  }
  const notePart = match[1];
  const octave = parseInt(match[2], 10);
  const pc = nameToPc(notePart);
  return (octave + 1) * 12 + pc;
}

/** Convert a MIDI note number to a sharp note name with octave. */
export function midiToNoteName(midi: number): string {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new Error(`Invalid MIDI note number: ${midi}`);
  }
  const octave = Math.floor(midi / 12) - 1;
  const pc = midi % 12;
  return `${SHARP_NAMES[pc]}${octave}`;
}

/** Parsed chord quality for the MVP. */
export type ChordQuality = "maj" | "min";

/** Parse a chord symbol into its canonical root and quality. */
export function parseChord(symbol: string): { root: string; quality: ChordQuality } {
  const trimmed = symbol.trim();
  const match = trimmed.match(/^([A-Ga-g](?:#|b)?)(m)?$/i);
  if (!match) {
    throw new Error(`Unknown chord symbol: "${symbol}"`);
  }
  const rawRoot = match[1];
  const qualitySuffix = match[2];
  // Capitalize first letter, keep accidental case as-is then normalize.
  const rootNormalized = normalizeNoteName(
    rawRoot.charAt(0).toUpperCase() + rawRoot.slice(1).toLowerCase()
  );
  const quality: ChordQuality = qualitySuffix ? "min" : "maj";
  return { root: rootNormalized, quality };
}

/** Return the canonical chord symbol (sharp root, "m" for minor, no suffix for major). */
export function normalizeChordSymbol(symbol: string): string {
  const { root, quality } = parseChord(symbol);
  return quality === "min" ? `${root}m` : root;
}

/** All 24 chord symbols used in the MVP (12 roots x major/minor). */
export const CHORD_VOCABULARY: string[] = SHARP_NAMES.flatMap((root) => [
  root,
  `${root}m`,
]);

/** Return the pitch classes [root, third, fifth] for a chord symbol. */
export function chordTones(symbol: string): number[] {
  const { root, quality } = parseChord(symbol);
  const rootPc = nameToPc(root);
  const thirdOffset = quality === "maj" ? 4 : 3;
  const third = (rootPc + thirdOffset) % 12;
  const fifth = (rootPc + 7) % 12;
  return [rootPc, third, fifth];
}

/** Check whether a string is a recognised chord symbol. */
export function isValidChordSymbol(symbol: string): boolean {
  try {
    parseChord(symbol);
    return true;
  } catch {
    return false;
  }
}
