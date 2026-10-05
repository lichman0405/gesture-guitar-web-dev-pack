import { describe, it, expect } from "vitest";
import { GestureDebouncer, type DebounceUpdate } from "./gestureDebouncer";
import type { GestureCandidate, GestureId } from "./gestureTypes";

function c(id: string, confidence: number): GestureCandidate {
  return { gestureId: id as GestureId, confidence };
}

function run(
  debouncer: GestureDebouncer,
  frames: Array<{ candidate: GestureCandidate | null; t: number }>,
): DebounceUpdate[] {
  return frames.map((f) => debouncer.update(f.candidate, f.t));
}

describe("GestureDebouncer", () => {
  it("commits a stable gesture after commitSeconds and changed is true exactly once", () => {
    const d = new GestureDebouncer();
    const results = run(d, [
      { candidate: c("index", 0.9), t: 0.0 },
      { candidate: c("index", 0.9), t: 0.08 },
      { candidate: c("index", 0.9), t: 0.15 },
      { candidate: c("index", 0.9), t: 0.16 },
      { candidate: c("index", 0.9), t: 0.2 },
      { candidate: c("index", 0.9), t: 0.3 },
    ]);

    expect(results[0].committed).toBeNull();
    expect(results[0].changed).toBe(false);
    expect(results[0].candidate).toBe("index");
    expect(results[0].candidateProgress).toBe(0);

    expect(results[1].committed).toBeNull();
    expect(results[1].changed).toBe(false);
    expect(results[1].candidate).toBe("index");
    expect(results[1].candidateProgress).toBeCloseTo(0.08 / 0.16);

    expect(results[2].committed).toBeNull();
    expect(results[2].changed).toBe(false);
    expect(results[2].candidateProgress).toBeCloseTo(0.15 / 0.16);

    expect(results[3].committed).toBe("index");
    expect(results[3].changed).toBe(true);
    expect(results[3].candidate).toBeNull();
    expect(results[3].candidateProgress).toBe(1);

    expect(results[4].committed).toBe("index");
    expect(results[4].changed).toBe(false);
    expect(results[4].candidate).toBeNull();
    expect(results[4].candidateProgress).toBe(0);

    expect(results[5].committed).toBe("index");
    expect(results[5].changed).toBe(false);
  });

  it("never commits when candidate flickers between two ids every 40 ms", () => {
    const d = new GestureDebouncer();
    const frames: Array<{ candidate: GestureCandidate | null; t: number }> = [];
    for (let i = 0; i < 10; i++) {
      frames.push({ candidate: c("index", 0.9), t: i * 0.08 });
      frames.push({ candidate: c("fist", 0.9), t: i * 0.08 + 0.04 });
    }
    const results = run(d, frames);
    expect(results.every((r) => r.committed === null && !r.changed)).toBe(true);
  });

  it("survives a one-frame misclassification without committing the intruder or clearing committed", () => {
    const d = new GestureDebouncer();
    // Commit "index"
    run(d, [
      { candidate: c("index", 0.9), t: 0.0 },
      { candidate: c("index", 0.9), t: 0.16 },
    ]);
    expect(d.committed).toBe("index");

    // One frame of "fist"
    const r1 = d.update(c("fist", 0.9), 0.2);
    expect(r1.committed).toBe("index");
    expect(r1.changed).toBe(false);
    expect(r1.candidate).toBe("fist");

    // Back to "index"
    const r2 = d.update(c("index", 0.9), 0.21);
    expect(r2.committed).toBe("index");
    expect(r2.changed).toBe(false);
    expect(r2.candidate).toBeNull();
  });

  it("keeps committed during short dropout and clears after retentionSeconds", () => {
    const d = new GestureDebouncer();
    // Commit "index"
    run(d, [
      { candidate: c("index", 0.9), t: 0.0 },
      { candidate: c("index", 0.9), t: 0.16 },
    ]);
    expect(d.committed).toBe("index");

    // Short dropout (0.1 s < 0.4 s)
    const r1 = d.update(null, 0.2);
    expect(r1.committed).toBe("index");
    expect(r1.changed).toBe(false);

    const r2 = d.update(null, 0.3);
    expect(r2.committed).toBe("index");
    expect(r2.changed).toBe(false);

    // Long dropout: total null 0.55 s > 0.4 s (from 0.20 to 0.75)
    const r3 = d.update(null, 0.75);
    expect(r3.committed).toBeNull();
    expect(r3.changed).toBe(true);
  });

  it("treats low-confidence candidates as null", () => {
    const d = new GestureDebouncer();
    const results = run(d, [
      { candidate: c("index", 0.59), t: 0.0 },
      { candidate: c("index", 0.59), t: 0.2 },
      { candidate: c("index", 0.59), t: 0.4 },
    ]);
    expect(results.every((r) => r.committed === null && !r.changed)).toBe(true);
  });

  it("allows a new gesture to commit before retention expires", () => {
    const d = new GestureDebouncer();
    // Commit "index"
    run(d, [
      { candidate: c("index", 0.9), t: 0.0 },
      { candidate: c("index", 0.9), t: 0.16 },
    ]);

    // Dropout for 0.1 s
    d.update(null, 0.2);
    d.update(null, 0.3);

    // New gesture appears before retention expires
    const r1 = d.update(c("fist", 0.9), 0.35);
    expect(r1.committed).toBe("index");
    expect(r1.changed).toBe(false);
    expect(r1.candidate).toBe("fist");

    // "fist" commits at 0.35 + 0.16 = 0.51, before retention would expire at 0.60
    const r2 = d.update(c("fist", 0.9), 0.51);
    expect(r2.committed).toBe("fist");
    expect(r2.changed).toBe(true);
  });

  it("cancels dropout when the committed gesture reappears during retention", () => {
    const d = new GestureDebouncer();
    run(d, [
      { candidate: c("index", 0.9), t: 0.0 },
      { candidate: c("index", 0.9), t: 0.16 },
    ]);

    d.update(null, 0.2);
    d.update(null, 0.3);

    // Reappearance of committed gesture cancels dropout
    const r = d.update(c("index", 0.9), 0.35);
    expect(r.committed).toBe("index");
    expect(r.changed).toBe(false);

    // Fresh dropout must accumulate the full retention again
    const r2 = d.update(null, 0.36);
    expect(r2.committed).toBe("index");
    expect(r2.changed).toBe(false);

    const r3 = d.update(null, 0.75);
    expect(r3.committed).toBe("index");
    expect(r3.changed).toBe(false);

    const r4 = d.update(null, 0.76);
    expect(r4.committed).toBeNull();
    expect(r4.changed).toBe(true);
  });

  it("ramps candidateProgress from 0 to 1 during a pending commit", () => {
    const d = new GestureDebouncer();
    const results = run(d, [
      { candidate: c("index", 0.9), t: 0.0 },
      { candidate: c("index", 0.9), t: 0.04 },
      { candidate: c("index", 0.9), t: 0.08 },
      { candidate: c("index", 0.9), t: 0.12 },
      { candidate: c("index", 0.9), t: 0.16 },
    ]);

    expect(results[0].candidateProgress).toBe(0);
    expect(results[1].candidateProgress).toBeCloseTo(0.04 / 0.16);
    expect(results[2].candidateProgress).toBeCloseTo(0.08 / 0.16);
    expect(results[3].candidateProgress).toBeCloseTo(0.12 / 0.16);
    expect(results[4].candidateProgress).toBe(1);
    expect(results[4].committed).toBe("index");
    expect(results[4].changed).toBe(true);
  });

  it("reset() clears committed and timers", () => {
    const d = new GestureDebouncer();
    run(d, [
      { candidate: c("index", 0.9), t: 0.0 },
      { candidate: c("index", 0.9), t: 0.16 },
    ]);
    expect(d.committed).toBe("index");

    d.reset();
    expect(d.committed).toBeNull();

    const r = d.update(c("fist", 0.9), 0.0);
    expect(r.committed).toBeNull();
    expect(r.candidate).toBe("fist");
    expect(r.candidateProgress).toBe(0);
  });

  it("handles time going backwards by resetting timers without throwing", () => {
    const d = new GestureDebouncer();
    const results = run(d, [
      { candidate: c("index", 0.9), t: 0.0 },
      { candidate: c("index", 0.9), t: 0.08 },
      { candidate: c("index", 0.9), t: 0.05 }, // backwards
      { candidate: c("index", 0.9), t: 0.1 },
      { candidate: c("index", 0.9), t: 0.26 },
    ]);

    expect(results[0].candidateProgress).toBe(0);
    expect(results[1].candidateProgress).toBeCloseTo(0.08 / 0.16);
    // Backwards frame resets the candidate timer
    expect(results[2].candidateProgress).toBe(0);
    // Fresh candidate timer started at t=0.05, so at t=0.1 elapsed is 0.05
    expect(results[3].candidateProgress).toBeCloseTo(0.05 / 0.16);
    // Commit at t=0.05 + 0.16 = 0.21, but next frame is 0.26 which is >= 0.21
    expect(results[4].committed).toBe("index");
    expect(results[4].changed).toBe(true);
  });
});
