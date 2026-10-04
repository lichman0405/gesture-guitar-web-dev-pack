import { describe, expect, it } from "vitest";
import type { ChordEvent, PerformanceEvent, StrumEvent } from "../performance/eventTypes";

describe("domain event contracts", () => {
  it("chord and strum events satisfy the contract shape", () => {
    const chord: ChordEvent = {
      type: "chord",
      t: 0,
      slot: "slot-1",
      chord: "C",
      confidence: 0.95,
      source: "keyboard",
    };
    const strum: StrumEvent = {
      type: "strum",
      t: 0.1,
      direction: "down",
      velocity: 1.2,
      intensity: 0.8,
      articulation: "normal",
      source: "keyboard",
    };
    const events: PerformanceEvent[] = [chord, strum];
    expect(events.map((e) => e.type)).toEqual(["chord", "strum"]);
  });
});
