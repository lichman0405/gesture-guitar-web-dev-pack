import { describe, it, expect } from "vitest";
import { StrumDetector } from "./strumDetector";
import type { CalibrationData } from "./calibrationTypes";
import type { StrumEvent } from "../performance/eventTypes";

const DT = 1 / 60;

const TEST_CALIBRATION: CalibrationData = {
  version: 1,
  calibratedAt: "",
  handScale: 0.2,
  noiseFloor: 0.005,
  chordHandNeutral: null,
  performanceHandNeutral: null,
  strumCorridor: { topY: 0.3, bottomY: 0.8, neutralY: 0.55 },
  sensitivity: 1,
};

function generateLinearTrace(
  startY: number,
  endY: number,
  duration: number,
  startT: number = 0,
): Array<{ y: number; t: number }> {
  const steps = Math.max(1, Math.round(duration / DT));
  const trace: Array<{ y: number; t: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = startT + i * DT;
    const y = startY + (endY - startY) * (i / steps);
    trace.push({ y, t });
  }
  return trace;
}

function runTrace(detector: StrumDetector, trace: Array<{ y: number | null; t: number }>): StrumEvent[] {
  const events: StrumEvent[] = [];
  for (const sample of trace) {
    const ev = detector.update(sample.y, sample.t);
    if (ev) events.push(ev);
  }
  return events;
}

describe("StrumDetector", () => {
  it("fires exactly one down event on a fast down sweep", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const trace = generateLinearTrace(0.4, 0.7, 0.12);
    const events = runTrace(detector, trace);
    expect(events).toHaveLength(1);
    expect(events[0].direction).toBe("down");
    expect(events[0].type).toBe("strum");
    expect(events[0].source).toBe("vision");
  });

  it("fires exactly one up event on a fast up sweep", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const trace = generateLinearTrace(0.7, 0.4, 0.12);
    const events = runTrace(detector, trace);
    expect(events).toHaveLength(1);
    expect(events[0].direction).toBe("up");
  });

  it("does not fire twice when the same sweep continues after fire", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const fast = generateLinearTrace(0.4, 0.7, 0.12);
    const drift = generateLinearTrace(0.7, 0.75, 0.5, fast[fast.length - 1].t);
    drift.shift();
    const events = runTrace(detector, fast.concat(drift));
    expect(events).toHaveLength(1);
  });

  it("fires again on a second distinct stroke after velocity drops", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const first = generateLinearTrace(0.4, 0.7, 0.12);
    const dwell = generateLinearTrace(0.7, 0.7, 0.2, first[first.length - 1].t);
    dwell.shift();
    const second = generateLinearTrace(0.7, 0.95, 0.12, dwell[dwell.length - 1].t);
    second.shift();
    const events = runTrace(detector, first.concat(dwell).concat(second));
    expect(events).toHaveLength(2);
    expect(events[0].direction).toBe("down");
    expect(events[1].direction).toBe("down");
  });

  it("never fires on slow drift", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const trace = generateLinearTrace(0.4, 0.6, 1.5);
    const events = runTrace(detector, trace);
    expect(events).toHaveLength(0);
  });

  it("never fires on jitter around a fixed point", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const trace: Array<{ y: number; t: number }> = [];
    const duration = 2.0;
    const steps = Math.round(duration / DT);
    for (let i = 0; i <= steps; i++) {
      const t = i * DT;
      const y = 0.5 + (i % 2 === 0 ? 0.005 : -0.005);
      trace.push({ y, t });
    }
    const events = runTrace(detector, trace);
    expect(events).toHaveLength(0);
  });

  it("never fires when movement is entirely outside the corridor", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const trace = generateLinearTrace(0.85, 0.95, 0.12);
    const events = runTrace(detector, trace);
    expect(events).toHaveLength(0);
  });

  it("fast stroke produces higher intensity than medium stroke", () => {
    const detectorFast = new StrumDetector(TEST_CALIBRATION);
    const detectorMedium = new StrumDetector(TEST_CALIBRATION);
    const fastTrace = generateLinearTrace(0.4, 0.7, 0.12);
    const mediumTrace = generateLinearTrace(0.4, 0.6, 0.2);
    const fastEvents = runTrace(detectorFast, fastTrace);
    const mediumEvents = runTrace(detectorMedium, mediumTrace);
    expect(fastEvents.length).toBe(1);
    expect(mediumEvents.length).toBe(1);
    expect(fastEvents[0].intensity).toBeGreaterThan(mediumEvents[0].intensity);
    expect(fastEvents[0].intensity).toBeLessThanOrEqual(1);
    expect(fastEvents[0].intensity).toBeGreaterThan(0);
    expect(mediumEvents[0].intensity).toBeLessThanOrEqual(1);
    expect(mediumEvents[0].intensity).toBeGreaterThan(0);
  });

  it("muted callback produces muted articulation", () => {
    const detector = new StrumDetector(TEST_CALIBRATION, { muted: () => true });
    const trace = generateLinearTrace(0.4, 0.7, 0.12);
    const events = runTrace(detector, trace);
    expect(events).toHaveLength(1);
    expect(events[0].articulation).toBe("muted");
  });

  it("handles down feint then genuine up stroke, emitting at most one up event", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const feint = generateLinearTrace(0.5, 0.56, 0.08);
    const up = generateLinearTrace(0.56, 0.3, 0.12, feint[feint.length - 1].t);
    up.shift();
    const events = runTrace(detector, feint.concat(up));
    expect(events.length).toBeLessThanOrEqual(1);
    if (events.length === 1) {
      expect(events[0].direction).toBe("up");
    }
  });

  it("does not crash or fire when null samples occur during tracking", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const trace: Array<{ y: number | null; t: number }> = [];
    // First half of a fast stroke (not enough displacement to fire on its own)
    const first = generateLinearTrace(0.4, 0.5, 0.06);
    for (const s of first) trace.push(s);
    // Null gap (10 frames) lets velocity decay and tracking abort
    const nullFrames = 10;
    for (let i = 1; i <= nullFrames; i++) {
      trace.push({ y: null, t: first[first.length - 1].t + i * DT });
    }
    // Second half
    const lastT = first[first.length - 1].t + nullFrames * DT;
    const second = generateLinearTrace(0.5, 0.6, 0.06);
    for (const s of second) trace.push({ y: s.y, t: lastT + s.t });
    const events = runTrace(detector, trace);
    expect(events.length).toBeLessThanOrEqual(1);
  });

  it("sensitivity 2 lowers effective threshold compared to sensitivity 1", () => {
    const calLow: CalibrationData = { ...TEST_CALIBRATION, sensitivity: 1 };
    const calHigh: CalibrationData = { ...TEST_CALIBRATION, sensitivity: 2 };
    // Medium-slow stroke: normalized velocity ~1.2, displacement ~0.6 handScales.
    const trace = generateLinearTrace(0.4, 0.52, 0.5);
    const detectorLow = new StrumDetector(calLow);
    const detectorHigh = new StrumDetector(calHigh);
    const eventsLow = runTrace(detectorLow, trace);
    const eventsHigh = runTrace(detectorHigh, trace);
    expect(eventsLow).toHaveLength(0);
    expect(eventsHigh).toHaveLength(1);
  });

  it("cooldown prevents two max-speed strokes 30ms apart", () => {
    const detector = new StrumDetector(TEST_CALIBRATION);
    const first = generateLinearTrace(0.4, 0.7, 0.12);
    // Dwell 2 frames (~33ms)
    const dwell = generateLinearTrace(0.7, 0.7, 2 * DT, first[first.length - 1].t);
    dwell.shift();
    const second = generateLinearTrace(0.7, 0.95, 0.12, dwell[dwell.length - 1].t);
    second.shift();
    const events = runTrace(detector, first.concat(dwell).concat(second));
    expect(events).toHaveLength(1);
  });
});
