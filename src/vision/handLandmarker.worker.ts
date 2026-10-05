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

workerSelf.onmessage = async (event: MessageEvent<VisionWorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === "init") {
    try {
      const vision = await FilesetResolver.forVisionTasks(msg.wasmBaseUrl);
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: msg.modelUrl,
          delegate: msg.delegate,
        },
        runningMode: "VIDEO",
        numHands: msg.maxHands,
      });
      const out: VisionWorkerOutMessage = { type: "ready" };
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
