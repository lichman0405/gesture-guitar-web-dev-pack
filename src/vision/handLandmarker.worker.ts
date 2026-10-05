import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type {
  VisionWorkerInMessage,
  VisionWorkerOutMessage,
  VisionFrame,
  TrackedHand,
  Point3,
} from "./types";

// tsconfig lib is DOM; including the webworker lib reference would conflict
// with the global DOM `self` declaration, so we cast minimally.
const workerSelf = self as unknown as {
  postMessage(message: VisionWorkerOutMessage): void;
  onmessage: ((event: MessageEvent<VisionWorkerInMessage>) => void) | null;
};

let landmarker: HandLandmarker | null = null;

/**
 * Startup delegate benchmark. GPU is only faster than CPU when a REAL GPU
 * backs WebGL; with software GL (SwiftShader, blocklisted drivers) it is far
 * slower than the XNNPACK CPU delegate. Rather than guessing, we time both on
 * a dummy frame and keep the winner — the winning instance is reused, so the
 * common fast-GPU case costs one model load, worst case two.
 */
const BENCH_SWAP_MS = 60; // GPU slower than this → also try CPU
const BENCH_RUNS = 3;

interface BenchResult {
  lm: HandLandmarker;
  avgMs: number;
}

async function createLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  msg: Extract<VisionWorkerInMessage, { type: "init" }>,
  delegate: "GPU" | "CPU",
): Promise<HandLandmarker> {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: msg.modelUrl, delegate },
    runningMode: "VIDEO",
    numHands: msg.maxHands,
  });
}

async function benchDelegate(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  msg: Extract<VisionWorkerInMessage, { type: "init" }>,
  delegate: "GPU" | "CPU",
  bitmap: ImageBitmap,
): Promise<BenchResult | null> {
  try {
    const lm = await createLandmarker(vision, msg, delegate);
    // One untimed warmup run absorbs lazy graph compilation, so the warmup
    // cost never lands on the user's first real frame.
    lm.detectForVideo(bitmap, 0);
    let total = 0;
    for (let i = 1; i <= BENCH_RUNS; i++) {
      const t0 = performance.now();
      lm.detectForVideo(bitmap, i * 40);
      total += performance.now() - t0;
    }
    return { lm, avgMs: total / BENCH_RUNS };
  } catch {
    return null;
  }
}

workerSelf.onmessage = async (event: MessageEvent<VisionWorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === "init") {
    try {
      const vision = await FilesetResolver.forVisionTasks(msg.wasmBaseUrl);
      const benchCanvas = new OffscreenCanvas(480, 360);
      benchCanvas.getContext("2d"); // required before transferToImageBitmap
      const benchBitmap = benchCanvas.transferToImageBitmap();

      const gpu =
        msg.delegate === "GPU" ? await benchDelegate(vision, msg, "GPU", benchBitmap) : null;
      const cpu =
        !gpu || gpu.avgMs > BENCH_SWAP_MS
          ? await benchDelegate(vision, msg, "CPU", benchBitmap)
          : null;
      benchBitmap.close();

      let winner: BenchResult | null = null;
      let loser: BenchResult | null = null;
      let delegate: "GPU" | "CPU" = "GPU";
      if (gpu && (!cpu || gpu.avgMs <= cpu.avgMs)) {
        winner = gpu;
        loser = cpu;
        delegate = "GPU";
      } else if (cpu) {
        winner = cpu;
        loser = gpu;
        delegate = "CPU";
      }
      loser?.lm.close();
      if (!winner) {
        throw new Error("HandLandmarker failed to initialize on both GPU and CPU delegates");
      }
      landmarker = winner.lm;
      const out: VisionWorkerOutMessage = {
        type: "ready",
        delegate,
        benchmark: { gpuMs: gpu?.avgMs ?? null, cpuMs: cpu?.avgMs ?? null },
      };
      workerSelf.postMessage(out);
    } catch (err) {
      const out: VisionWorkerOutMessage = { type: "error", message: String(err) };
      workerSelf.postMessage(out);
    }
    return;
  }

  if (msg.type === "detect") {
    if (!landmarker) {
      msg.bitmap.close();
      return;
    }
    const start = performance.now();
    try {
      const result = landmarker.detectForVideo(msg.bitmap, Math.round(msg.t * 1000));
      const inferenceMs = performance.now() - start;
      const hands: TrackedHand[] = [];
      for (let i = 0; i < result.landmarks.length; i++) {
        const landmarks: Point3[] = result.landmarks[i].map((lm: NormalizedLandmark) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
        }));
        const handedness = result.handedness[i];
        const physical = handedness && handedness.length > 0 ? handedness[0].categoryName : undefined;
        if (physical !== "Left" && physical !== "Right") continue;
        const score = handedness && handedness.length > 0 ? handedness[0].score : 0;
        hands.push({ physical, landmarks, score });
      }
      const frame: VisionFrame = {
        t: msg.t,
        hands,
        inferenceMs,
        frameWidth: msg.bitmap.width,
        frameHeight: msg.bitmap.height,
      };
      const out: VisionWorkerOutMessage = { type: "frame", frame };
      workerSelf.postMessage(out);
    } catch (err) {
      const out: VisionWorkerOutMessage = { type: "error", message: String(err) };
      workerSelf.postMessage(out);
    } finally {
      msg.bitmap.close();
    }
    return;
  }

  if (msg.type === "dispose") {
    if (landmarker) {
      landmarker.close();
      landmarker = null;
    }
  }
};
