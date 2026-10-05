import type { TimeSignature } from "../performance/eventTypes";
import type { StrumPattern, StrumStep } from "./types";

function beatsPerBarFor(sig: TimeSignature): number {
  switch (sig) {
    case "4/4":
      return 4;
    case "3/4":
      return 3;
    case "6/8":
      return 6;
  }
}

function makeDownBeats(sig: TimeSignature): StrumStep[] {
  const beats = beatsPerBarFor(sig);
  const steps: StrumStep[] = [];
  for (let i = 0; i < beats; i++) {
    steps.push({ beatOffset: i, direction: "down" });
  }
  return steps;
}

function makeDownUp8ths(sig: TimeSignature): StrumStep[] {
  const beats = beatsPerBarFor(sig);
  // In 6/8 the beat unit is already the eighth note, so step on every beat.
  // In 4/4 and 3/4 we step on every half-beat.
  const stepSize = sig === "6/8" ? 1 : 0.5;
  const count = sig === "6/8" ? beats : beats * 2;
  const steps: StrumStep[] = [];
  for (let i = 0; i < count; i++) {
    steps.push({
      beatOffset: i * stepSize,
      direction: i % 2 === 0 ? "down" : "up",
    });
  }
  return steps;
}

function makeFolk432(): StrumStep[] {
  return [
    { beatOffset: 0, direction: "down" },
    { beatOffset: 1, direction: "down" },
    { beatOffset: 1.5, direction: "up" },
    { beatOffset: 2.5, direction: "up" },
    { beatOffset: 3, direction: "down" },
    { beatOffset: 3.5, direction: "up" },
  ];
}

function generateSteps(id: string, sig: TimeSignature): StrumStep[] | null {
  switch (id) {
    case "down-beats":
      return makeDownBeats(sig);
    case "down-up-8ths":
      return makeDownUp8ths(sig);
    case "folk-432": {
      if (sig !== "4/4") return null;
      return makeFolk432();
    }
    default:
      return null;
  }
}

/** Canonical pattern library (steps rendered for 4/4). Use `getPatternForMeter` for other meters. */
export const STRUM_PATTERNS: StrumPattern[] = [
  {
    id: "down-beats",
    name: "Down Beats",
    timeSignatures: ["4/4", "3/4", "6/8"],
    steps: makeDownBeats("4/4"),
  },
  {
    id: "down-up-8ths",
    name: "Down-Up Eighths",
    timeSignatures: ["4/4", "3/4", "6/8"],
    steps: makeDownUp8ths("4/4"),
  },
  {
    id: "folk-432",
    name: "Folk 4-3-2",
    timeSignatures: ["4/4"],
    steps: makeFolk432(),
  },
];

/** Returns a copy of the requested pattern with steps tailored to the given meter. */
export function getPatternForMeter(
  patternId: string,
  sig: TimeSignature
): StrumPattern | null {
  const base = STRUM_PATTERNS.find((p) => p.id === patternId);
  if (!base) return null;
  if (!base.timeSignatures.includes(sig)) return null;
  const steps = generateSteps(patternId, sig);
  if (!steps) return null;
  return { ...base, steps };
}
