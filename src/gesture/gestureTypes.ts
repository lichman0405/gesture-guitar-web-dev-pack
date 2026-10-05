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
  /** 21 metric/aspect-corrected landmarks: wrist at origin, unit wrist-to-middle-MCP. */
  landmarks: Point3[];
  /** Image-space wrist -> middle MCP distance, used for motion calibration. */
  scale: number;
  /** Raw (image-normalized) wrist position before centering — used for motion tracking. */
  wristRaw: Point3;
  /** Raw palm center (mean of wrist + 4 MCP joints), image-normalized. */
  palmCenterRaw: Point3;
  /** Image-space center of index/middle knuckles; independent of finger curl. */
  strumPointRaw?: Point3;
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
  /** Joint-based extension strength, 0 folded .. 1 extended. */
  extension?: Record<keyof FingerExtension, number>;
  /** Fingertip -> wrist distance, divided by hand scale (per finger). */
  tipDistances: { thumb: number; index: number; middle: number; ring: number; pinky: number };
  /** thumb tip <-> index tip distance, scale-normalized (small = circle/OK). */
  thumbIndexTipDistance: number;
  /** Separates a bent pick-grip index from a fully closed fist. */
  indexPipAngle?: number;
  /** Mean curl of the four fingers: 0 = fully extended, 1 = fully curled. */
  curlAmount: number;
  handScale: number;
  wristRaw: Point3;
  palmCenterRaw: Point3;
}

/** Fixed chord poses plus reserved performance/system poses. */
export const GESTURE_IDS = [
  "index",
  "index-middle",
  "index-middle-ring",
  "four-fingers",
  "open-palm",
  "thumbs-up",
  "pinky",
  "index-pinky",
  "thumb-index",
  "thumb-pinky",
  "ok-sign",
  "pick-grip",
  "fist",
] as const;

export type GestureId = (typeof GESTURE_IDS)[number];

export interface GestureCandidate {
  gestureId: GestureId;
  confidence: number;
}

/** Gesture slots bind gestures to chords (Scale or Custom mode). */
export const SLOT_IDS = ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6", "slot-7", "slot-8", "slot-9", "slot-10"] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/** Default gesture -> slot assignment for the chord hand. */
export const DEFAULT_SLOT_GESTURES: Record<SlotId, GestureId> = {
  "slot-1": "index",
  "slot-2": "index-middle",
  "slot-3": "index-middle-ring",
  "slot-4": "four-fingers",
  "slot-5": "open-palm",
  "slot-6": "thumbs-up",
  "slot-7": "pinky",
  "slot-8": "index-pinky",
  "slot-9": "thumb-index",
  "slot-10": "thumb-pinky",
};

export const GESTURE_LABELS: Record<GestureId, string> = {
  index: "食指", "index-middle": "食指＋中指", "index-middle-ring": "食指＋中指＋无名指",
  "four-fingers": "四指伸直，拇指收起", "open-palm": "五指张开", "thumbs-up": "竖起拇指",
  pinky: "小指", "index-pinky": "食指＋小指（摇滚）", "thumb-index": "拇指＋食指（L）",
  "thumb-pinky": "拇指＋小指（电话）", "ok-sign": "OK", "pick-grip": "捏拨片", fist: "握拳",
};

/** Gestures reserved for the performance hand / system control (never chord slots). */
export const MUTE_GESTURE: GestureId = "fist";
export const OK_GESTURE: GestureId = "ok-sign";
