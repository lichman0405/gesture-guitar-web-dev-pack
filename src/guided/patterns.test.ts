import { describe, it, expect } from "vitest";
import { STRUM_PATTERNS, getPatternForMeter } from "./patterns";
import type { TimeSignature } from "../performance/eventTypes";

describe("STRUM_PATTERNS", () => {
  it("contains the three built-in ids", () => {
    const ids = STRUM_PATTERNS.map((p) => p.id);
    expect(ids).toContain("down-beats");
    expect(ids).toContain("down-up-8ths");
    expect(ids).toContain("folk-432");
  });
});

describe("getPatternForMeter", () => {
  it("returns valid sorted steps for each supported meter", () => {
    const cases: [string, TimeSignature, number][] = [
      ["down-beats", "4/4", 4],
      ["down-beats", "3/4", 3],
      ["down-beats", "6/8", 6],
      ["down-up-8ths", "4/4", 8],
      ["down-up-8ths", "3/4", 6],
      ["down-up-8ths", "6/8", 6],
      ["folk-432", "4/4", 6],
    ];
    for (const [id, sig, expectedCount] of cases) {
      const pattern = getPatternForMeter(id, sig);
      expect(pattern).not.toBeNull();
      expect(pattern!.steps.length).toBe(expectedCount);
      for (let i = 1; i < pattern!.steps.length; i++) {
        expect(pattern!.steps[i].beatOffset).toBeGreaterThanOrEqual(
          pattern!.steps[i - 1].beatOffset
        );
      }
      const beatsPerBar = sig === "4/4" ? 4 : sig === "3/4" ? 3 : 6;
      for (const step of pattern!.steps) {
        expect(step.beatOffset).toBeGreaterThanOrEqual(0);
        expect(step.beatOffset).toBeLessThan(beatsPerBar);
      }
    }
  });

  it("returns null for unknown id", () => {
    expect(getPatternForMeter("unknown", "4/4")).toBeNull();
  });

  it("returns null for folk-432 in 3/4", () => {
    expect(getPatternForMeter("folk-432", "3/4")).toBeNull();
  });
});
