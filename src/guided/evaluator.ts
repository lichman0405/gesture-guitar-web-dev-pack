import type { PerformanceEvent, StrumEvent, ChordEvent } from "../performance/eventTypes";
import type { ExpectedEvent, EvaluationResult, EvaluateOptions, BarIssue } from "./types";

const DEFAULT_TOLERANCE = 0.15;

/**
 * Scores an actual event log against expectations.
 *
 * Strum matching: greedy nearest-neighbour in expected-time order.
 * For each expected strum (ascending t) we pick the unmatched actual StrumEvent
 * with the smallest absolute delta, provided it lies within ±tolerance.
 * Ties are broken by the earlier actual time.
 *
 * Timing stats: mean absolute error (milliseconds) and population standard
 * deviation of those absolute errors (milliseconds).
 */
export function evaluateSession(
  expected: ExpectedEvent[],
  events: PerformanceEvent[],
  options?: EvaluateOptions
): EvaluationResult {
  const tolerance = options?.toleranceSeconds ?? DEFAULT_TOLERANCE;

  const expectedStrums = expected.filter(
    (e): e is Extract<ExpectedEvent, { kind: "strum" }> => e.kind === "strum"
  );
  const expectedChords = expected.filter(
    (e): e is Extract<ExpectedEvent, { kind: "chord" }> => e.kind === "chord"
  );
  const actualStrums = events.filter((e): e is StrumEvent => e.type === "strum");
  const actualChords = events.filter((e): e is ChordEvent => e.type === "chord");

  const matchedActual = new Set<number>();
  const timingErrorsMs: number[] = [];
  let strumHit = 0;
  let directionCorrect = 0;
  const missedStrumBars = new Set<number>();
  const wrongDirectionBars = new Set<number>();

  for (const exp of expectedStrums) {
    let bestIdx = -1;
    let bestDelta = Infinity;
    let bestActualT = Infinity;

    for (let i = 0; i < actualStrums.length; i++) {
      if (matchedActual.has(i)) continue;
      const delta = Math.abs(actualStrums[i].t - exp.t);
      if (delta <= tolerance) {
        if (delta < bestDelta || (delta === bestDelta && actualStrums[i].t < bestActualT)) {
          bestDelta = delta;
          bestActualT = actualStrums[i].t;
          bestIdx = i;
        }
      }
    }

    if (bestIdx >= 0) {
      matchedActual.add(bestIdx);
      strumHit++;
      timingErrorsMs.push(bestDelta * 1000);
      if (actualStrums[bestIdx].direction === exp.direction) {
        directionCorrect++;
      } else {
        wrongDirectionBars.add(exp.bar);
      }
    } else {
      missedStrumBars.add(exp.bar);
    }
  }

  const extraStrums = actualStrums.length - matchedActual.size;

  // Chord evaluation
  let chordHit = 0;
  const chordMissBars = new Set<number>();
  const chordMissMessages = new Map<number, string>();
  const unstableBars = new Set<number>();

  for (let i = 0; i < expectedChords.length; i++) {
    const exp = expectedChords[i];
    const windowStart = exp.t - tolerance;
    const windowEnd = i + 1 < expectedChords.length ? expectedChords[i + 1].t : Infinity;

    const chordsInBarWindow = actualChords.filter(
      (ac) => ac.t >= exp.t && ac.t < windowEnd
    );
    if (chordsInBarWindow.length > 2) {
      unstableBars.add(exp.bar);
    }

    const chordsInHitWindow = actualChords.filter(
      (ac) => ac.t >= windowStart && ac.t < windowEnd
    );
    const hit = chordsInHitWindow.some((ac) => ac.chord === exp.chord);

    if (hit) {
      chordHit++;
    } else {
      chordMissBars.add(exp.bar);
      if (chordsInHitWindow.length > 0) {
        chordMissMessages.set(
          exp.bar,
          `expected ${exp.chord}, played ${chordsInHitWindow[0].chord}`
        );
      } else {
        chordMissMessages.set(exp.bar, "no chord change");
      }
    }
  }

  const avgTimingErrorMs =
    timingErrorsMs.length > 0
      ? Math.round((timingErrorsMs.reduce((a, b) => a + b, 0) / timingErrorsMs.length) * 1e10) / 1e10
      : 0;

  const timingSpreadMs =
    timingErrorsMs.length > 0
      ? Math.round(
          Math.sqrt(
            timingErrorsMs.reduce((sum, e) => sum + (e - avgTimingErrorMs) ** 2, 0) /
              timingErrorsMs.length
          ) * 1e10
        ) / 1e10
      : 0;

  const barIssues: BarIssue[] = [];
  const allBars = new Set<number>([
    ...missedStrumBars,
    ...wrongDirectionBars,
    ...chordMissBars,
    ...unstableBars,
  ]);

  for (const bar of Array.from(allBars).sort((a, b) => a - b)) {
    if (missedStrumBars.has(bar)) {
      barIssues.push({ bar, message: "missed strum" });
    }
    if (wrongDirectionBars.has(bar)) {
      barIssues.push({ bar, message: "wrong direction" });
    }
    if (chordMissBars.has(bar)) {
      barIssues.push({ bar, message: chordMissMessages.get(bar)! });
    }
    if (unstableBars.has(bar)) {
      barIssues.push({ bar, message: "unstable chord bar" });
    }
  }

  return {
    strumExpected: expectedStrums.length,
    strumHit,
    directionCorrect,
    missedStrums: expectedStrums.length - strumHit,
    extraStrums,
    avgTimingErrorMs,
    timingSpreadMs,
    chordExpected: expectedChords.length,
    chordHit,
    unstableChordBars: Array.from(unstableBars).sort((a, b) => a - b),
    barIssues,
  };
}
