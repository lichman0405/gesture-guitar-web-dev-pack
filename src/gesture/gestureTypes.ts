/**
 * Feature-space contracts shared by the gesture and motion modules.
 * Implemented by src/gesture/gestureFeatures.ts (normalization + features)
 * and consumed by classifiers/detectors. Defined here so all modules code
 * against one Supervisor-owned contract.
 */

import type { PhysicalHand, Point3 } from "../vision/types";

/** Hand pose landmarks in a wrist-centered, scale-normalized frame. */
export interface NormalizedHand {
  physical: PhysicalHand;
  /** 21 landmarks: wrist at origin, divided by `scale`. */
  landmarks: Point3[];
  /** Hand scale metric used for normalization (wrist -> middle MCP distance, raw units). */
  scale: number;
  /** Raw (image-normalized) wrist position before centering — used for motion tracking. */
  wristRaw: Point3;
  /** Raw palm center (mean of wrist + 4 MCP joints), image-normalized. */
  palmCenterRaw: Point3;
  t: number;
}

export interface FingerExtension {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

/** Derived, classification-ready features for one hand in one frame. */
export interface HandFeatures {
  physical: PhysicalHand;
  t: number;
  fingers: FingerExtension;
  /** Fingertip -> wrist distance, divided by hand scale (per finger). */
  tipDistances: { thumb: number; index: number; middle: number; ring: number; pinky: number };
  /** thumb tip <-> index tip distance, scale-normalized (small = circle/OK). */
  thumbIndexTipDistance: number;
  /** Mean curl of the four fingers: 0 = fully extended, 1 = fully curled. */
  curlAmount: number;
  handScale: number;
  wristRaw: Point3;
  palmCenterRaw: Point3;
}

/** Fixed MVP gesture vocabulary (PRODUCT_SPEC §4). */
export const GESTURE_IDS = [
  "index",
  "index-middle",
  "index-middle-ring",
  "four-fingers",
  "open-palm",
  "thumbs-up",
  "ok-sign",
  "fist",
] as const;

export type GestureId = (typeof GESTURE_IDS)[number];

export interface GestureCandidate {
  gestureId: GestureId;
  confidence: number;
}

/** Gesture slots bind gestures to chords (Scale or Custom mode). */
export const SLOT_IDS = ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/** Default gesture -> slot assignment for the chord hand. */
export const DEFAULT_SLOT_GESTURES: Record<SlotId, GestureId> = {
  "slot-1": "index",
  "slot-2": "index-middle",
  "slot-3": "index-middle-ring",
  "slot-4": "four-fingers",
  "slot-5": "open-palm",
  "slot-6": "thumbs-up",
};

/** Gestures reserved for the performance hand / system control (never chord slots). */
export const MUTE_GESTURE: GestureId = "fist";
export const OK_GESTURE: GestureId = "ok-sign";
