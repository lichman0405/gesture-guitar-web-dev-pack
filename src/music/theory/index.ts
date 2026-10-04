/**
 * Music theory module public API.
 */

export {
  noteNameToMidi,
  midiToNoteName,
  parseChord,
  normalizeChordSymbol,
  CHORD_VOCABULARY,
  chordTones,
  isValidChordSymbol,
  type ChordQuality,
} from "./chords";

export {
  MAJOR_KEYS,
  SCALE_SLOT_ORDER,
  SCALE_SLOT_IDS,
  diatonicChords,
  scaleModeMapping,
} from "./keys";

export {
  getVoicingFrets,
  getVoicing,
  STANDARD_TUNING,
  type GuitarStringNote,
} from "./voicings";
