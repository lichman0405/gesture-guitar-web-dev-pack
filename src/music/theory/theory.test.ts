import { describe, expect, it } from "vitest";
import {
  noteNameToMidi,
  midiToNoteName,
  parseChord,
  normalizeChordSymbol,
  CHORD_VOCABULARY,
  chordTones,
  isValidChordSymbol,
  MAJOR_KEYS,
  SCALE_SLOT_ORDER,
  SCALE_SLOT_IDS,
  diatonicChords,
  scaleModeMapping,
  getVoicingFrets,
  getVoicing,
  STANDARD_TUNING,
} from "./index";

describe("noteNameToMidi / midiToNoteName", () => {
  it("converts known anchor notes correctly", () => {
    expect(noteNameToMidi("E2")).toBe(40);
    expect(noteNameToMidi("A2")).toBe(45);
    expect(noteNameToMidi("C4")).toBe(60);
    expect(noteNameToMidi("C#4")).toBe(61);
    expect(noteNameToMidi("Bb3")).toBe(58);
  });

  it("round-trips every MIDI note 0-127", () => {
    for (let midi = 0; midi <= 127; midi++) {
      const name = midiToNoteName(midi);
      expect(noteNameToMidi(name)).toBe(midi);
    }
  });

  it("throws on invalid note names", () => {
    expect(() => noteNameToMidi("H2")).toThrow();
    expect(() => noteNameToMidi("C")).toThrow();
    expect(() => noteNameToMidi("Cx4")).toThrow();
  });

  it("throws on invalid MIDI numbers", () => {
    expect(() => midiToNoteName(-1)).toThrow();
    expect(() => midiToNoteName(128)).toThrow();
    expect(() => midiToNoteName(1.5)).toThrow();
  });
});

describe("parseChord / normalizeChordSymbol", () => {
  it("parses major chords without suffix", () => {
    expect(parseChord("C")).toEqual({ root: "C", quality: "maj" });
    expect(parseChord("F#")).toEqual({ root: "F#", quality: "maj" });
    expect(parseChord("Bb")).toEqual({ root: "A#", quality: "maj" });
  });

  it("parses minor chords with 'm' suffix", () => {
    expect(parseChord("Cm")).toEqual({ root: "C", quality: "min" });
    expect(parseChord("F#m")).toEqual({ root: "F#", quality: "min" });
    expect(parseChord("Bbm")).toEqual({ root: "A#", quality: "min" });
  });

  it("handles flat aliases and case variations", () => {
    expect(normalizeChordSymbol("Db")).toBe("C#");
    expect(normalizeChordSymbol("db")).toBe("C#");
    expect(normalizeChordSymbol("EB")).toBe("D#");
    expect(normalizeChordSymbol("Gb")).toBe("F#");
    expect(normalizeChordSymbol("Abm")).toBe("G#m");
    expect(normalizeChordSymbol("Bbm")).toBe("A#m");
    expect(normalizeChordSymbol("E#")).toBe("F");
    expect(normalizeChordSymbol("Fb")).toBe("E");
    expect(normalizeChordSymbol("B#")).toBe("C");
    expect(normalizeChordSymbol("Cb")).toBe("B");
  });

  it("throws on unknown symbols", () => {
    expect(() => parseChord("H")).toThrow();
    expect(() => parseChord("Cmaj7")).toThrow();
    expect(() => parseChord("")).toThrow();
    expect(() => normalizeChordSymbol("Xyz")).toThrow();
  });
});

describe("CHORD_VOCABULARY", () => {
  it("contains exactly 24 entries", () => {
    expect(CHORD_VOCABULARY).toHaveLength(24);
  });

  it("has unique entries", () => {
    const set = new Set(CHORD_VOCABULARY);
    expect(set.size).toBe(CHORD_VOCABULARY.length);
  });

  it("normalizes every entry to itself", () => {
    for (const sym of CHORD_VOCABULARY) {
      expect(normalizeChordSymbol(sym)).toBe(sym);
    }
  });
});

describe("chordTones", () => {
  it("returns correct triad pitch classes", () => {
    expect(chordTones("C")).toEqual([0, 4, 7]);
    expect(chordTones("Cm")).toEqual([0, 3, 7]);
    expect(chordTones("F#")).toEqual([6, 10, 1]); // F#=6, A#=10, C#=1
    expect(chordTones("F#m")).toEqual([6, 9, 1]); // F#=6, A=9, C#=1
  });
});

describe("isValidChordSymbol", () => {
  it("returns true for valid symbols", () => {
    expect(isValidChordSymbol("C")).toBe(true);
    expect(isValidChordSymbol("Cm")).toBe(true);
    expect(isValidChordSymbol("Bb")).toBe(true);
  });

  it("returns false for invalid symbols", () => {
    expect(isValidChordSymbol("H")).toBe(false);
    expect(isValidChordSymbol("Cmaj7")).toBe(false);
    expect(isValidChordSymbol("")).toBe(false);
  });
});

describe("diatonicChords", () => {
  it("returns correct diatonic chords for C major", () => {
    expect(diatonicChords("C")).toEqual({
      I: "C",
      ii: "Dm",
      iii: "Em",
      IV: "F",
      V: "G",
      vi: "Am",
    });
  });

  it("returns correct diatonic chords for G major", () => {
    expect(diatonicChords("G")).toEqual({
      I: "G",
      ii: "Am",
      iii: "Bm",
      IV: "C",
      V: "D",
      vi: "Em",
    });
  });

  it("returns correct diatonic chords for D major", () => {
    expect(diatonicChords("D")).toEqual({
      I: "D",
      ii: "Em",
      iii: "F#m",
      IV: "G",
      V: "A",
      vi: "Bm",
    });
  });

  it("returns correct diatonic chords for A major", () => {
    expect(diatonicChords("A")).toEqual({
      I: "A",
      ii: "Bm",
      iii: "C#m",
      IV: "D",
      V: "E",
      vi: "F#m",
    });
  });

  it("returns correct diatonic chords for F major", () => {
    expect(diatonicChords("F")).toEqual({
      I: "F",
      ii: "Gm",
      iii: "Am",
      IV: "A#",
      V: "C",
      vi: "Dm",
    });
  });

  it("normalises flat key alias Bb to A#", () => {
    expect(diatonicChords("Bb")).toEqual(diatonicChords("A#"));
    expect(scaleModeMapping("Bb")).toEqual(scaleModeMapping("A#"));
  });
});

describe("scaleModeMapping", () => {
  it("maps slot IDs to the correct Roman-numeral chords", () => {
    const mapping = scaleModeMapping("C");
    expect(mapping["slot-1"]).toBe("C");
    expect(mapping["slot-2"]).toBe("Dm");
    expect(mapping["slot-3"]).toBe("Em");
    expect(mapping["slot-4"]).toBe("F");
    expect(mapping["slot-5"]).toBe("G");
    expect(mapping["slot-6"]).toBe("Am");
  });

  it("uses the expected SCALE_SLOT_IDS", () => {
    expect(SCALE_SLOT_IDS).toEqual([
      "slot-1",
      "slot-2",
      "slot-3",
      "slot-4",
      "slot-5",
      "slot-6",
      "slot-7", "slot-8", "slot-9", "slot-10",
    ]);
  });

  it("uses the expected SCALE_SLOT_ORDER", () => {
    expect(SCALE_SLOT_ORDER).toEqual(["I", "ii", "iii", "IV", "V", "vi"]);
  });

  it("has 12 major keys", () => {
    expect(MAJOR_KEYS).toHaveLength(12);
  });
});

describe("getVoicingFrets", () => {
  it("returns 6 entries for every vocabulary chord", () => {
    for (const sym of CHORD_VOCABULARY) {
      const frets = getVoicingFrets(sym);
      expect(frets).toHaveLength(6);
    }
  });

  it("only contains non-negative integers or 'x'", () => {
    for (const sym of CHORD_VOCABULARY) {
      const frets = getVoicingFrets(sym);
      for (const f of frets) {
        expect(f === "x" || (typeof f === "number" && Number.isInteger(f) && f >= 0)).toBe(true);
      }
    }
  });
});

describe("getVoicing", () => {
  it("returns 6 entries for every vocabulary chord", () => {
    for (const sym of CHORD_VOCABULARY) {
      const voicing = getVoicing(sym);
      expect(voicing).toHaveLength(6);
    }
  });

  it("has at least 4 sounding strings for every vocabulary chord", () => {
    for (const sym of CHORD_VOCABULARY) {
      const voicing = getVoicing(sym);
      const sounding = voicing.filter((s) => s.midi !== null);
      expect(sounding.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("only sounds notes belonging to the chord", () => {
    for (const sym of CHORD_VOCABULARY) {
      const tones = new Set(chordTones(sym));
      const voicing = getVoicing(sym);
      for (const stringNote of voicing) {
        if (stringNote.midi !== null) {
          expect(tones.has(stringNote.midi % 12)).toBe(true);
        }
      }
    }
  });

  it("has the root as the lowest sounding pitch class (root position)", () => {
    for (const sym of CHORD_VOCABULARY) {
      const rootPc = chordTones(sym)[0];
      const voicing = getVoicing(sym);
      const sounding = voicing
        .filter((s): s is { midi: number; muted?: boolean } => s.midi !== null)
        .map((s) => s.midi);
      expect(sounding.length).toBeGreaterThanOrEqual(1);
      const lowestMidi = Math.min(...sounding);
      expect(lowestMidi % 12).toBe(rootPc);
    }
  });

  it("marks muted strings correctly", () => {
    const cVoicing = getVoicing("C");
    expect(cVoicing[0]).toEqual({ midi: null, muted: true });
    expect(cVoicing[3]).toEqual({ midi: STANDARD_TUNING[3] + 0, muted: undefined });
  });

  it("matches exact fret arrays for a selection of chords", () => {
    expect(getVoicingFrets("C")).toEqual(["x", 3, 2, 0, 1, 0]);
    expect(getVoicingFrets("Cm")).toEqual(["x", 3, 5, 5, 4, 3]);
    expect(getVoicingFrets("F#")).toEqual([2, 4, 4, 3, 2, 2]);
    expect(getVoicingFrets("F#m")).toEqual([2, 4, 4, 2, 2, 2]);
    expect(getVoicingFrets("C#m")).toEqual(["x", 4, 6, 6, 5, 4]);
  });

  it("throws on garbage input", () => {
    expect(() => getVoicing("XYZ")).toThrow();
    expect(() => getVoicingFrets("Cmaj7")).toThrow();
    expect(() => getVoicing("H")).toThrow();
  });
});

it("adds four distinct, transposed secondary/borrowed chords to the six original slots", () => {
  expect(Object.values(scaleModeMapping("C"))).toEqual(["C", "Dm", "Em", "F", "G", "Am", "D", "E", "Cm", "A#"]);
  expect(Object.values(scaleModeMapping("G"))).toEqual(["G", "Am", "Bm", "C", "D", "Em", "A", "B", "Gm", "F"]);
  for (const key of MAJOR_KEYS) expect(new Set(Object.values(scaleModeMapping(key))).size).toBe(10);
});
