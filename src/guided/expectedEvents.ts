import type { BeatGrid } from "../music/timing/beatGrid";
import type { ExpectedEvent, GuidedPlan } from "./types";

export function buildExpectedEvents(
  plan: GuidedPlan,
  grid: BeatGrid
): ExpectedEvent[] {
  const events: ExpectedEvent[] = [];
  const beatsPerBar = grid.beatsPerBar;
  const beatDuration = grid.beatDuration;
  const countInBeats = grid.countInBeats;
  const barCount = plan.barCount ?? plan.progression.bars.length;

  for (let b = 0; b < barCount; b++) {
    const barFirstBeatAbsolute = countInBeats + b * beatsPerBar;
    const barStart = grid.beatTime(barFirstBeatAbsolute);

    // Chord expectations only where the progression defines one
    // (pattern-only Guided Rhythm plans have an empty progression).
    if (b < plan.progression.bars.length) {
      events.push({
        kind: "chord",
        t: barStart,
        chord: plan.progression.bars[b].chord,
        bar: b,
      });
    }

    for (const step of plan.pattern.steps) {
      if (step.beatOffset >= beatsPerBar) continue;
      events.push({
        kind: "strum",
        t: barStart + step.beatOffset * beatDuration,
        direction: step.direction,
        accent: step.accent ?? false,
        bar: b,
        beatInBar: Math.floor(step.beatOffset),
      });
    }
  }

  events.sort((a, b) => a.t - b.t);
  return events;
}
