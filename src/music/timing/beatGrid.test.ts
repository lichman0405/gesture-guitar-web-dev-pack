import { describe, expect, it } from "vitest";
import { BeatGrid, beatDurationSeconds, meterFromSignature } from "./beatGrid";

describe("meterFromSignature", () => {
  it("maps all supported time signatures", () => {
    expect(meterFromSignature("4/4")).toEqual({ beatsPerBar: 4, beatUnit: 4 });
    expect(meterFromSignature("3/4")).toEqual({ beatsPerBar: 3, beatUnit: 4 });
    expect(meterFromSignature("6/8")).toEqual({ beatsPerBar: 6, beatUnit: 8 });
  });
});

describe("beatDurationSeconds", () => {
  it("120bpm 4/4 = 0.5s per beat", () => {
    expect(beatDurationSeconds(120, meterFromSignature("4/4"))).toBeCloseTo(0.5);
  });
  it("60bpm 6/8 = 0.5s per eighth", () => {
    expect(beatDurationSeconds(60, meterFromSignature("6/8"))).toBeCloseTo(0.5);
  });
});

describe("BeatGrid", () => {
  it("rejects out-of-range bpm", () => {
    expect(() => new BeatGrid(10, "4/4")).toThrow();
    expect(() => new BeatGrid(500, "4/4")).toThrow();
  });

  it("beatTime advances by beat duration", () => {
    const grid = new BeatGrid(120, "4/4", 1);
    expect(grid.beatTime(0)).toBe(0);
    expect(grid.beatTime(4)).toBeCloseTo(2);
    expect(grid.musicStartTime).toBeCloseTo(2);
  });

  it("count-in occupies whole bars; music starts after", () => {
    const grid = new BeatGrid(100, "3/4", 2);
    expect(grid.countInBeats).toBe(6);
    expect(grid.musicStartTime).toBeCloseTo(6 * 0.6);
  });

  it("positionAt reports count-in then bars/beats", () => {
    const grid = new BeatGrid(120, "4/4", 1); // beat = 0.5s, count-in = 4 beats
    const during = grid.positionAt(0.75); // beat index 1 -> still count-in
    expect(during.inCountIn).toBe(true);
    expect(during.beatIndex).toBe(1);

    const start = grid.positionAt(2.0); // exactly music start
    expect(start.inCountIn).toBe(false);
    expect(start.bar).toBe(0);
    expect(start.beatInBar).toBe(0);

    const later = grid.positionAt(2.0 + 5 * 0.5 + 0.1); // bar 1 beat 1
    expect(later.bar).toBe(1);
    expect(later.beatInBar).toBe(1);
    expect(later.beatPhase).toBeCloseTo(0.2, 1);
  });

  it("6/8 accent pattern has strong+medium", () => {
    const grid = new BeatGrid(90, "6/8", 0);
    expect(grid.accentLevel(0)).toBe("strong");
    expect(grid.accentLevel(3)).toBe("medium");
    expect(grid.accentLevel(1)).toBe("weak");
  });

  it("barBeatAt wraps beats across bars", () => {
    const grid = new BeatGrid(120, "3/4", 0);
    expect(grid.barBeatAt(0)).toEqual({ bar: 0, beatInBar: 0 });
    expect(grid.barBeatAt(5)).toEqual({ bar: 1, beatInBar: 2 });
    expect(grid.barBeatAt(6)).toEqual({ bar: 2, beatInBar: 0 });
  });
});
