import { describe, expect, it, beforeEach } from "vitest";
import { EventBus } from "../performance/eventBus";
import type { PerformanceEvent } from "../performance/eventTypes";
import { VisionPipeline } from "./visionPipeline";
import type { VisionFrame } from "../vision/types";
import { buildGestureHand } from "../debug/syntheticLandmarks";
import type { CalibrationData } from "../motion/calibrationTypes";

const DT = 1 / 30;
// DEFAULT_CALIBRATION corridor is topY 0.35 / bottomY 0.75, handScale 0.2.
// Synthetic palm center sits ~0.93*scale above the wrist, so pick wrist
// positions that put the palm inside the corridor.
const WRIST_REST_Y = 0.586; // palm ≈ 0.40
const WRIST_STRUMMED_Y = 0.886; // palm ≈ 0.70

let busNow: number;
let events: PerformanceEvent[];
let bus: EventBus;

function makeFrame(t: number, hands: ReturnType<typeof buildGestureHand>[]): VisionFrame {
  return { t, hands, inferenceMs: 10, frameWidth: 640, frameHeight: 480 };
}

function makePipeline(overrides?: {
  resolveSlotChord?: (slot: string) => string | null;
  onCalibrationComplete?: (c: CalibrationData) => void;
}) {
  const pipeline = new VisionPipeline(bus, {
    handedness: "right",
    resolveSlotChord:
      overrides?.resolveSlotChord ??
      ((slot) => ({ "slot-1": "C", "slot-2": "Dm" })[slot] ?? null),
    onCalibrationComplete: overrides?.onCalibrationComplete,
  });
  return pipeline;
}

/** Feed n frames holding static gestures on both hands. */
function feedStatic(
  pipeline: VisionPipeline,
  startT: number,
  frames: number,
  chordGesture: Parameters<typeof buildGestureHand>[0],
  perfGesture: Parameters<typeof buildGestureHand>[0],
  wristY = WRIST_REST_Y,
): number {
  let t = startT;
  for (let i = 0; i < frames; i++) {
    pipeline.handleFrame(
      makeFrame(t, [
        buildGestureHand(chordGesture, { physical: "Left" }),
        buildGestureHand(perfGesture, { physical: "Right", wrist: { x: 0.5, y: wristY, z: 0 } }),
      ]),
    );
    t += DT;
  }
  return t;
}

beforeEach(() => {
  busNow = 100;
  events = [];
  bus = new EventBus({ now: () => busNow });
  bus.subscribe((e) => events.push(e));
});

describe("VisionPipeline", () => {
  it("commits a held chord gesture to one ChordEvent on the bus clock", () => {
    const pipeline = makePipeline();
    feedStatic(pipeline, 0, 12, "index", "open-palm"); // 0.4s > commit 0.16s
    const chords = events.filter((e) => e.type === "chord");
    expect(chords).toHaveLength(1);
    expect(chords[0]).toMatchObject({
      type: "chord",
      slot: "slot-1",
      chord: "C",
      source: "vision",
      t: busNow,
    });
  });

  it("emits a second ChordEvent when the gesture changes and is held", () => {
    const pipeline = makePipeline();
    const t = feedStatic(pipeline, 0, 12, "index", "open-palm");
    feedStatic(pipeline, t, 12, "index-middle", "open-palm");
    const chords = events.filter((e) => e.type === "chord");
    expect(chords.map((c) => (c.type === "chord" ? c.chord : ""))).toEqual(["C", "Dm"]);
  });

  it("ignores a one-frame misclassification blip", () => {
    const pipeline = makePipeline();
    const t0 = feedStatic(pipeline, 0, 12, "index", "open-palm");
    // Single-frame blip of a different gesture, then back to index.
    const t1 = feedStatic(pipeline, t0, 1, "index-middle", "open-palm");
    feedStatic(pipeline, t1, 8, "index", "open-palm");
    const chords = events.filter((e) => e.type === "chord");
    expect(chords).toHaveLength(1);
  });

  it("activates and releases mute from a fist on the performance hand", () => {
    const pipeline = makePipeline();
    const t = feedStatic(pipeline, 0, 8, "index", "fist"); // 0.27s > activate 0.12s
    feedStatic(pipeline, t, 10, "index", "open-palm"); // 0.33s > release 0.2s
    const mutes = events.filter((e) => e.type === "mute");
    expect(mutes.map((m) => (m.type === "mute" ? m.active : null))).toEqual([true, false]);
  });

  it("emits exactly one down StrumEvent for one downward stroke", () => {
    const pipeline = makePipeline();
    // Settle at rest so the smoother/velocity estimator baseline at ~0.
    let t = feedStatic(pipeline, 0, 10, "index", "open-palm", WRIST_REST_Y);
    // Linear downward sweep through the corridor over 10 frames (~0.33s).
    for (let i = 1; i <= 10; i++) {
      const y = WRIST_REST_Y + ((WRIST_STRUMMED_Y - WRIST_REST_Y) * i) / 10;
      pipeline.handleFrame(
        makeFrame(t, [
          buildGestureHand("index", { physical: "Left" }),
          buildGestureHand("open-palm", {
            physical: "Right",
            wrist: { x: 0.5, y, z: 0 },
          }),
        ]),
      );
      t += DT;
    }
    // Hold at the end position; cooldown + zero velocity must not retrigger.
    feedStatic(pipeline, t, 8, "index", "open-palm", WRIST_STRUMMED_Y);

    const strums = events.filter((e) => e.type === "strum");
    expect(strums).toHaveLength(1);
    const strum = strums[0];
    if (strum.type !== "strum") throw new Error("unreachable");
    expect(strum.direction).toBe("down");
    expect(strum.articulation).toBe("normal");
    expect(strum.intensity).toBeGreaterThan(0);
    expect(strum.intensity).toBeLessThanOrEqual(1);
    expect(strum.source).toBe("vision");
  });

  it("fires a control event for a two-hand combo hold", () => {
    const pipeline = makePipeline();
    feedStatic(pipeline, 0, 45, "thumbs-up", "thumbs-up"); // 1.5s > hold 1.2s
    const controls = events.filter((e) => e.type === "control");
    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({ type: "control", action: "ready", source: "vision" });
    // thumbs-up is slot-6, which the stub leaves unmapped → no chord event.
    expect(events.filter((e) => e.type === "chord")).toHaveLength(0);
  });

  it("runs calibration from frames and adopts the result", () => {
    let completed: CalibrationData | null = null;
    const pipeline = makePipeline({ onCalibrationComplete: (c) => (completed = c) });
    pipeline.beginCalibration(1);
    feedStatic(pipeline, 0, 85, "index", "open-palm"); // ≈2.8s > 2.5s window
    expect(completed).not.toBeNull();
    expect(completed!.handScale).toBeGreaterThan(0.03);
    expect(pipeline.getCalibration()).toBe(completed);
  });

  it("keeps debug stats pollable", () => {
    const pipeline = makePipeline();
    feedStatic(pipeline, 0, 12, "index", "open-palm");
    const stats = pipeline.getDebugStats();
    expect(stats.committedGesture).toBe("index");
    expect(stats.fps).toBeGreaterThan(0);
    expect(stats.inferenceMs).toBe(10);
  });
});
