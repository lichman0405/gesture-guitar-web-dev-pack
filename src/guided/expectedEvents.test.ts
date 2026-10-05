import { describe, it, expect } from "vitest";
import { BeatGrid } from "../music/timing/beatGrid";
import { buildExpectedEvents } from "./expectedEvents";
import { getPatternForMeter } from "./patterns";
import type { GuidedPlan, ExpectedEvent } from "./types";

describe("buildExpectedEvents", () => {
  it("emits chord and strum expectations correctly for 4/4 with count-in", () => {
    const grid = new BeatGrid(120, "4/4", 1);
    const plan: GuidedPlan = {
      pattern: getPatternForMeter("down-beats", "4/4")!,
      progression: { bars: [{ chord: "C" }, { chord: "G" }] },
    };
    const events = buildExpectedEvents(plan, grid);

    const chordExpectations = events.filter(
      (e): e is Extract<ExpectedEvent, { kind: "chord" }> => e.kind === "chord"
    );
    expect(chordExpectations).toHaveLength(2);
    expect(chordExpectations[0].t).toBeCloseTo(2.0, 10);
    expect(chordExpectations[0].chord).toBe("C");
    expect(chordExpectations[1].t).toBeCloseTo(4.0, 10);
    expect(chordExpectations[1].chord).toBe("G");

    const strumExpectations = events.filter(
      (e): e is Extract<ExpectedEvent, { kind: "strum" }> => e.kind === "strum"
    );
    expect(strumExpectations).toHaveLength(8);
    expect(strumExpectations[0].t).toBeCloseTo(2.0, 10);
    expect(strumExpectations[1].t).toBeCloseTo(2.5, 10);
    expect(strumExpectations[2].t).toBeCloseTo(3.0, 10);
    expect(strumExpectations[3].t).toBeCloseTo(3.5, 10);
    expect(strumExpectations[4].t).toBeCloseTo(4.0, 10);
    expect(strumExpectations[5].t).toBeCloseTo(4.5, 10);
    expect(strumExpectations[6].t).toBeCloseTo(5.0, 10);
    expect(strumExpectations[7].t).toBeCloseTo(5.5, 10);

    for (let i = 1; i < events.length; i++) {
      expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
    }
  });

  it("6/8 grid sanity", () => {
    const grid = new BeatGrid(120, "6/8", 1);
    expect(grid.beatDuration).toBeCloseTo(0.25, 10);

    const plan: GuidedPlan = {
      pattern: getPatternForMeter("down-beats", "6/8")!,
      progression: { bars: [{ chord: "Am" }] },
    };
    const events = buildExpectedEvents(plan, grid);
    const strums = events.filter(
      (e): e is Extract<ExpectedEvent, { kind: "strum" }> => e.kind === "strum"
    );
    expect(strums).toHaveLength(6);
    expect(strums[0].t).toBeCloseTo(1.5, 10);
    expect(strums[5].t).toBeCloseTo(1.5 + 5 * 0.25, 10);
  });
});
