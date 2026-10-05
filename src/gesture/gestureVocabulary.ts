import type { GestureId, FingerExtension } from "./gestureTypes.ts";

export const L_THUMB_SPREAD_MIN = 0.45;

export interface GestureRule {
  id: GestureId;
  /** Required extension state per finger; "any" = don't care. */
  fingers: {
    thumb: boolean | "any";
    index: boolean | "any";
    middle: boolean | "any";
    ring: boolean | "any";
    pinky: boolean | "any";
  };
  /** When set, thumbIndexTipDistance must be <= this (pinch gestures). */
  maxThumbIndexDistance?: number;
  minIndexPipAngle?: number;
  /** L requires radial spread; pointing accepts a resting or uncertain thumb. */
  thumbPosture?: "spread" | "resting";
  /** Pose-specific tolerance for natural finger coupling (e.g. rock). */
  fingerCertainty?: Partial<Record<keyof FingerExtension, number>>;
  /** When set, curlAmount must be >= this (fist-like). */
  minCurl?: number;
  /** When set, curlAmount must be <= this (open-like). */
  maxCurl?: number;
}

export const GESTURE_RULES: GestureRule[] = [
  {
    id: "fist",
    fingers: { thumb: false, index: false, middle: false, ring: false, pinky: false },
    minCurl: 0.75,
  },
  {
    id: "open-palm",
    fingers: { thumb: true, index: true, middle: true, ring: true, pinky: true },
    maxCurl: 0.25,
  },
  {
    id: "four-fingers",
    fingers: { thumb: false, index: true, middle: true, ring: true, pinky: true },
    maxCurl: 0.35,
  },
  {
    id: "index",
    fingers: { thumb: "any", index: true, middle: false, ring: false, pinky: false },
    thumbPosture: "resting",
  },
  {
    id: "index-middle",
    fingers: { thumb: "any", index: true, middle: true, ring: false, pinky: false },
  },
  {
    id: "index-middle-ring",
    fingers: { thumb: "any", index: true, middle: true, ring: true, pinky: false },
  },
  {
    id: "thumbs-up",
    fingers: { thumb: true, index: false, middle: false, ring: false, pinky: false },
    minCurl: 0.55,
  },
  {
    id: "pinky",
    fingers: { thumb: false, index: false, middle: false, ring: false, pinky: true },
  },
  {
    id: "index-pinky",
    fingers: { thumb: "any", index: true, middle: false, ring: false, pinky: true },
    fingerCertainty: { pinky: 0.45, middle: 0.5, ring: 0.4 },
  },
  {
    id: "thumb-index",
    fingers: { thumb: true, index: true, middle: false, ring: false, pinky: false },
    thumbPosture: "spread",
  },
  {
    id: "thumb-pinky",
    fingers: { thumb: true, index: false, middle: false, ring: false, pinky: true },
  },
  {
    id: "pick-grip",
    fingers: { thumb: "any", index: "any", middle: "any", ring: "any", pinky: "any" },
    maxThumbIndexDistance: 0.3,
    minIndexPipAngle: 95,
  },
  {
    id: "ok-sign",
    fingers: { thumb: "any", index: "any", middle: true, ring: true, pinky: true },
    maxThumbIndexDistance: 0.5,
  },
];

/** Tie-breaking order: earlier entries win. More-specific gestures first. */
export const GESTURE_PRIORITY: GestureId[] = [
  "ok-sign",
  "pick-grip",
  "thumbs-up",
  "fist",
  "open-palm",
  "four-fingers",
  "pinky",
  "index-pinky",
  "thumb-index",
  "thumb-pinky",
  "index-middle-ring",
  "index-middle",
  "index",
];
