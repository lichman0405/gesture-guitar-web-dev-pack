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

  it("releases an active vision mute when performance controls are disabled", () => {
    const pipeline = makePipeline();
    const t = feedStatic(pipeline, 0, 8, "index", "fist");
    pipeline.setEnabled(false);
    feedStatic(pipeline, t, 50, "index-middle", "fist");
    expect(events.filter((event) => event.type === "mute")).toMatchObject([
      { active: true }, { active: false },
    ]);
    expect(events.filter((event) => event.type === "control")).toHaveLength(0);
  });
});

describe("two-hand playing regressions", () => {
  it("commits all ten fixed gestures without letting the performance pose change the chord", () => {
    const names = ["index", "index-middle", "index-middle-ring", "four-fingers", "open-palm", "thumbs-up", "pinky", "index-pinky", "thumb-index", "thumb-pinky"] as const;
    const pipeline = makePipeline({ resolveSlotChord: (slot) => slot });
    let t = 0;
    names.forEach((name, index) => {
      t = feedStatic(pipeline, t, 9, name, names[(index + 2) % names.length]);
    });
    expect(events.filter((e) => e.type === "chord").map((e) => e.type === "chord" ? e.slot : null))
      .toEqual(names.map((_, i) => `slot-${i + 1}`));
    expect(events.filter((e) => e.type === "strum")).toHaveLength(0);
  });

  it("does not stop while playing an open-palm chord with continuous open-hand strokes", () => {
    const pipeline = makePipeline({ resolveSlotChord: () => "G" });
    for (let i = 0; i <= 120; i++) {
      pipeline.handleFrame(makeFrame(i * DT, [
        buildGestureHand("open-palm", { physical: "Left", wrist: { x: 0.25, y: 0.6, z: 0 } }),
        buildGestureHand("open-palm", { physical: "Right", wrist: { x: 0.75, y: 0.72 - 0.065 * Math.cos(2 * Math.PI * 2 * i * DT), z: 0 } }),
      ]));
    }
    expect(events.filter((e) => e.type === "strum")).toHaveLength(16);
    expect(events.filter((e) => e.type === "control")).toHaveLength(0);
  });

  it("plays wrist-pivot strokes while the wrist itself stays in one position", () => {
    const pipeline = makePipeline();
    const wrist = { x: 0.75, y: 0.55, z: 0 };
    const right = buildGestureHand("thumb-index", { physical: "Right", wrist, scale: 0.18 });
    for (let i = 0; i <= 90; i++) {
      const angle = Math.PI / 2 + 0.45 * Math.cos(2 * Math.PI * 2 * i * DT);
      const moving = { ...right, landmarks: right.landmarks.map((p) => ({
        x: wrist.x + (p.x - wrist.x) * Math.cos(angle) - (p.y - wrist.y) * Math.sin(angle),
        y: wrist.y + (p.x - wrist.x) * Math.sin(angle) + (p.y - wrist.y) * Math.cos(angle), z: p.z,
      })) };
      pipeline.handleFrame(makeFrame(i * DT, [buildGestureHand("index", { physical: "Left" }), moving]));
    }
    expect(events.filter((e) => e.type === "strum")).toHaveLength(12);
  });

  it("keeps left/right roles through brief model label errors while fingers change", () => {
    const pipeline = makePipeline();
    let t = 0;
    for (let i = 0; i < 9; i++, t += DT) {
      pipeline.handleFrame(makeFrame(t, [
        buildGestureHand("index", { physical: "Left", wrist: { x: 0.3, y: 0.5, z: 0 } }),
        buildGestureHand("open-palm", { physical: "Right", wrist: { x: 0.7, y: WRIST_REST_Y, z: 0 } }),
      ]));
    }
    for (let i = 0; i < 9; i++) {
      const chord = buildGestureHand("index-middle", { physical: "Left", wrist: { x: 0.3, y: 0.5, z: 0 } });
      const perf = buildGestureHand("thumbs-up", { physical: "Right", wrist: { x: 0.7, y: WRIST_REST_Y, z: 0 } });
      pipeline.handleFrame(makeFrame(t, i % 3 === 0 ? [{ ...perf, physical: "Left" }, { ...chord, physical: "Right" }] : [chord, perf]));
      t += DT;
    }
    expect(events.filter((e) => e.type === "chord").map((e) => e.type === "chord" ? e.chord : null)).toEqual(["C", "Dm"]);
  });
});

describe("pick grip vs mute", () => {
  it("lets a closed pick grip play normally while keeping deliberate fist mute", () => {
    const pipeline = makePipeline();
    let t = feedStatic(pipeline, 0, 9, "index", "pick-grip");
    for (let i = 0; i <= 20; i++, t += DT) {
      pipeline.handleFrame(makeFrame(t, [
        buildGestureHand("index", { physical: "Left" }),
        buildGestureHand("pick-grip", { physical: "Right", wrist: { x: 0.5, y: 0.72 - 0.07 * Math.cos(Math.PI * i / 10), z: 0 } }),
      ]));
    }
    expect(events.filter((e) => e.type === "mute")).toHaveLength(0);
    const strums = events.filter((e) => e.type === "strum");
    expect(strums).toHaveLength(2);
    expect(strums.every((e) => e.type === "strum" && e.articulation === "normal")).toBe(true);
    feedStatic(pipeline, t, 9, "index", "fist");
    expect(events.filter((e) => e.type === "mute")).toMatchObject([{ active: true }]);
  });
});
