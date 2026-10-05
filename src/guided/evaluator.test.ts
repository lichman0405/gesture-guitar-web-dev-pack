import { describe, it, expect } from "vitest";
import { evaluateSession } from "./evaluator";
import type { ExpectedEvent } from "./types";
import type { PerformanceEvent } from "../performance/eventTypes";

function makeStrumExpected(
  t: number,
  direction: "down" | "up",
  bar = 0,
  beatInBar = 0
): ExpectedEvent {
  return { kind: "strum", t, direction, accent: false, bar, beatInBar };
}

function makeChordExpected(t: number, chord: string, bar = 0): ExpectedEvent {
  return { kind: "chord", t, chord, bar };
}

function makeStrumActual(t: number, direction: "down" | "up"): PerformanceEvent {
  return {
    type: "strum",
    t,
    direction,
    velocity: 1,
    intensity: 0.8,
    articulation: "normal",
    source: "test",
  };
}

function makeChordActual(t: number, chord: string): PerformanceEvent {
  return {
    type: "chord",
    t,
    chord,
    confidence: 1,
    source: "test",
  };
}

describe("evaluateSession", () => {
  it("perfect performance", () => {
    const expected: ExpectedEvent[] = [
      makeChordExpected(0, "C", 0),
      makeStrumExpected(0, "down", 0, 0),
      makeStrumExpected(0.5, "down", 0, 0),
      makeChordExpected(2, "G", 1),
      makeStrumExpected(2, "down", 1, 0),
    ];
    const events: PerformanceEvent[] = [
      makeChordActual(0, "C"),
      makeStrumActual(0, "down"),
      makeStrumActual(0.5, "down"),
      makeChordActual(2, "G"),
      makeStrumActual(2, "down"),
    ];
    const result = evaluateSession(expected, events);
    expect(result.strumExpected).toBe(3);
    expect(result.strumHit).toBe(3);
    expect(result.directionCorrect).toBe(3);
    expect(result.missedStrums).toBe(0);
    expect(result.extraStrums).toBe(0);
    expect(result.avgTimingErrorMs).toBe(0);
    expect(result.timingSpreadMs).toBe(0);
    expect(result.chordExpected).toBe(2);
    expect(result.chordHit).toBe(2);
    expect(result.unstableChordBars).toEqual([]);
    expect(result.barIssues).toEqual([]);
  });

  it("one missed strum", () => {
    const expected: ExpectedEvent[] = [
      makeChordExpected(0, "C", 0),
      makeStrumExpected(0, "down", 0, 0),
      makeStrumExpected(0.5, "down", 0, 0),
    ];
    const events: PerformanceEvent[] = [
      makeChordActual(0, "C"),
      makeStrumActual(0, "down"),
    ];
    const result = evaluateSession(expected, events);
    expect(result.strumExpected).toBe(2);
    expect(result.strumHit).toBe(1);
    expect(result.missedStrums).toBe(1);
    expect(result.barIssues).toContainEqual({ bar: 0, message: "missed strum" });
  });

  it("one extra strum", () => {
    const expected: ExpectedEvent[] = [
      makeChordExpected(0, "C", 0),
      makeStrumExpected(0, "down", 0, 0),
    ];
    const events: PerformanceEvent[] = [
      makeChordActual(0, "C"),
      makeStrumActual(0, "down"),
      makeStrumActual(0.3, "up"),
    ];
    const result = evaluateSession(expected, events);
    expect(result.strumExpected).toBe(1);
    expect(result.strumHit).toBe(1);
    expect(result.extraStrums).toBe(1);
  });

  it("wrong direction counted", () => {
    const expected: ExpectedEvent[] = [
      makeChordExpected(0, "C", 0),
      makeStrumExpected(0, "down", 0, 0),
    ];
    const events: PerformanceEvent[] = [
      makeChordActual(0, "C"),
      makeStrumActual(0, "up"),
    ];
    const result = evaluateSession(expected, events);
    expect(result.strumHit).toBe(1);
    expect(result.directionCorrect).toBe(0);
    expect(result.barIssues).toContainEqual({
      bar: 0,
      message: "wrong direction",
    });
  });

  it("timing error math", () => {
    const expected: ExpectedEvent[] = [
      makeStrumExpected(0, "down", 0, 0),
      makeStrumExpected(1, "down", 0, 1),
    ];
    const events: PerformanceEvent[] = [
      makeStrumActual(0.05, "down"), // +50 ms
      makeStrumActual(0.97, "down"), // -30 ms
    ];
    const result = evaluateSession(expected, events);
    expect(result.strumHit).toBe(2);
    expect(result.avgTimingErrorMs).toBe(40);
    expect(result.timingSpreadMs).toBe(10);
  });

  it("chord hit and miss (wrong chord played)", () => {
    const expected: ExpectedEvent[] = [
      makeChordExpected(0, "C", 0),
      makeChordExpected(2, "G", 1),
    ];
    const events: PerformanceEvent[] = [
      makeChordActual(0, "C"),
      makeChordActual(2, "Em"),
    ];
    const result = evaluateSession(expected, events);
    expect(result.chordExpected).toBe(2);
    expect(result.chordHit).toBe(1);
    expect(result.barIssues).toContainEqual({
      bar: 1,
      message: "expected G, played Em",
    });
  });

  it("no chord change", () => {
    const expected: ExpectedEvent[] = [makeChordExpected(0, "C", 0)];
    const events: PerformanceEvent[] = [];
    const result = evaluateSession(expected, events);
    expect(result.chordHit).toBe(0);
    expect(result.barIssues).toContainEqual({
      bar: 0,
      message: "no chord change",
    });
  });

  it("unstable bar detection", () => {
    const expected: ExpectedEvent[] = [
      makeChordExpected(0, "C", 0),
      makeChordExpected(2, "G", 1),
    ];
    const events: PerformanceEvent[] = [
      makeChordActual(0.1, "C"),
      makeChordActual(0.2, "C"),
      makeChordActual(0.3, "C"),
      makeChordActual(0.4, "C"),
    ];
    const result = evaluateSession(expected, events);
    expect(result.unstableChordBars).toEqual([0]);
    expect(result.barIssues).toContainEqual({
      bar: 0,
      message: "unstable chord bar",
    });
  });

  it("empty inputs returns zeros and no NaN", () => {
    const result = evaluateSession([], []);
    expect(result.strumExpected).toBe(0);
    expect(result.strumHit).toBe(0);
    expect(result.directionCorrect).toBe(0);
    expect(result.missedStrums).toBe(0);
    expect(result.extraStrums).toBe(0);
    expect(result.avgTimingErrorMs).toBe(0);
    expect(result.timingSpreadMs).toBe(0);
    expect(result.chordExpected).toBe(0);
    expect(result.chordHit).toBe(0);
    expect(result.unstableChordBars).toEqual([]);
    expect(result.barIssues).toEqual([]);
    expect(Number.isNaN(result.avgTimingErrorMs)).toBe(false);
    expect(Number.isNaN(result.timingSpreadMs)).toBe(false);
  });
});
