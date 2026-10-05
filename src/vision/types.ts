/**
 * Vision module contracts (ARCHITECTURE.md §2/§5).
 *
 * The vision worker emits raw tracked hands; everything downstream
 * (normalization, gestures, motion) works on these types only and never
 * imports MediaPipe. Coordinates are MediaPipe-normalized image space:
 * x,y ∈ [0,1] relative to frame width/height (x right, y down), z is a
 * relative depth. Never classify from raw pixel coordinates.
 */

import type { HandRole, Handedness } from "../performance/eventTypes";

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** MediaPipe hand topology: 21 landmarks per hand. */
export const HAND_LANDMARK_COUNT = 21;

export const LandmarkIndex = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export type PhysicalHand = "Left" | "Right";

/** One hand detected in one frame. */
export interface TrackedHand {
  physical: PhysicalHand;
  /** 21 landmarks in MediaPipe normalized image coordinates. */
  landmarks: Point3[];
  /** Metric 3-D landmarks from the model, used for joint geometry when available. */
  worldLandmarks?: Point3[];
  /** MediaPipe handedness confidence 0..1. */
  score: number;
}

/** Worker output for one processed frame. */
export interface VisionFrame {
  /** Seconds on the vision/client clock when the frame was captured. */
  t: number;
  hands: TrackedHand[];
  /** Wall-clock inference duration for this frame (ms). */
  inferenceMs: number;
  frameWidth: number;
  frameHeight: number;
}

/** Maps detected physical hands to abstract musical roles (GESTURE_SPEC §1). */
export function roleForPhysicalHand(physical: PhysicalHand, handedness: Handedness): HandRole {
  // Right-handed default: left hand = chord hand, right hand = performance hand.
  const chordHand: PhysicalHand = handedness === "right" ? "Left" : "Right";
  return physical === chordHand ? "chord" : "performance";
}

/** Vision quality tiers for the adaptive performance controller (ARCHITECTURE §7). */
export interface VisionTier {
  id: "high" | "medium" | "low";
  width: number;
  height: number;
  /** Max detections per second submitted to the worker. */
  targetHz: number;
}

export const VISION_TIERS: Record<VisionTier["id"], VisionTier> = {
  high: { id: "high", width: 640, height: 480, targetHz: 30 },
  medium: { id: "medium", width: 448, height: 336, targetHz: 24 },
  low: { id: "low", width: 320, height: 240, targetHz: 24 },
};

/** Messages main thread -> vision worker. */
export type VisionWorkerInMessage =
  | {
      type: "init";
      /** Absolute URL of hand_landmarker.task. */
      modelUrl: string;
      /** Absolute URL directory of the MediaPipe WASM runtime. */
      wasmBaseUrl: string;
      maxHands: number;
      /** Preferred delegate; the worker benchmarks and may pick the other. */
      delegate: "GPU" | "CPU";
    }
  | { type: "detect"; bitmap: ImageBitmap; t: number }
  | { type: "dispose" };

/** Messages vision worker -> main thread. */
export type VisionWorkerOutMessage =
  | {
      type: "ready";
      /** Delegate actually running (chosen by startup benchmark). */
      delegate: "GPU" | "CPU";
      /** Startup benchmark timings per tried delegate (null = not tried/failed). */
      benchmark: { gpuMs: number | null; cpuMs: number | null };
    }
  | { type: "frame"; frame: VisionFrame }
  | { type: "error"; message: string };
