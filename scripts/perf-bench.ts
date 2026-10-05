/**
 * Phase 10 performance benchmark (deterministic, node).
 * Run: npx vite-node scripts/perf-bench.ts
 *
 * Measures the three real-time-critical paths with synthetic inputs:
 *  1. Vision pipeline per-frame processing (normalize → features → detectors),
 *     excluding MediaPipe inference (runs in a Web Worker off the main thread).
 *  2. Bus → engine strum scheduling latency (synchronous publish → scheduled).
 *  3. Karplus–Strong buffer synthesis throughput (offline render speed).
 */
import { EventBus } from "../src/performance/eventBus";
import { VisionPipeline } from "../src/app/visionPipeline";
import { buildGestureHand } from "../src/debug/syntheticLandmarks";
import { ProceduralGuitarEngine } from "../src/music/engine/ProceduralGuitarEngine";
import { FakeAudioContext } from "../src/test/fakeAudioContext";
import type { VisionFrame } from "../src/vision/types";
import type { StrumEvent } from "../src/performance/eventTypes";

function bench(name: string, iterations: number, fn: () => void): void {
  // Warmup.
  for (let i = 0; i < Math.min(50, iterations); i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const totalMs = performance.now() - start;
  console.log(
    `${name}: ${iterations} iterations in ${totalMs.toFixed(1)} ms ` +
      `(avg ${(totalMs / iterations).toFixed(4)} ms/op)`,
  );
}

// ── 1. Vision pipeline per-frame cost ─────────────────────────────
const bus = new EventBus();
bus.subscribe(() => {
  /* count events, no work */
});
const pipeline = new VisionPipeline(bus, {
  handedness: "right",
  resolveSlotChord: () => "C",
});

const chordHand = buildGestureHand("index", { physical: "Left" });
const perfHand = buildGestureHand("open-palm", {
  physical: "Right",
  wrist: { x: 0.5, y: 0.7, z: 0 },
});
let frameT = 0;
const DT = 1 / 30;
const frame = (): VisionFrame => {
  frameT += DT;
  return { t: frameT, hands: [chordHand, perfHand], inferenceMs: 10, frameWidth: 640, frameHeight: 480 };
};

bench("vision pipeline handleFrame (2 hands, full detector chain)", 5000, () => {
  pipeline.handleFrame(frame());
});

// ── 2. Bus → engine scheduling latency ────────────────────────────
const ctx = new FakeAudioContext();
const engine = new ProceduralGuitarEngine(ctx as never);
engine.setChord("C");
const strum: StrumEvent = {
  type: "strum",
  t: 0,
  direction: "down",
  velocity: 2,
  intensity: 0.6,
  articulation: "normal",
  source: "vision",
};

bench("strum event → scheduleStrum (6 voices scheduled)", 2000, () => {
  engine.scheduleStrum(strum, ctx.currentTime + 0.05);
});

// ── 3. KS synthesis throughput (cold cache) ───────────────────────
// A fresh engine must synthesize all 6 string buffers on the first strum.
const coldRuns: number[] = [];
for (let i = 0; i < 10; i++) {
  const coldCtx = new FakeAudioContext();
  const coldEngine = new ProceduralGuitarEngine(coldCtx as never);
  coldEngine.setChord("C");
  const t0 = performance.now();
  coldEngine.scheduleStrum(strum, 0.05);
  coldRuns.push(performance.now() - t0);
}
coldRuns.sort((a, b) => a - b);
console.log(
  `cold strum synthesis (6 KS buffers, ~2 s each @44.1 kHz): ` +
    `median ${coldRuns[5].toFixed(2)} ms, max ${coldRuns[9].toFixed(2)} ms over 10 runs`,
);
