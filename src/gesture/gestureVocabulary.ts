import type { GestureId } from "./gestureTypes.ts";

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
  /** When set, curlAmount must be >= this (fist-like). */
  minCurl?: number;
  /** When set, curlAmount must be <= this (open-like). */
  maxCurl?: number;
}

export const GESTURE_RULES: GestureRule[] = [
  {
    id: "fist",
    fingers: { thumb: "any", index: false, middle: false, ring: false, pinky: false },
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
    maxCurl: 0.7,
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
    id: "ok-sign",
    fingers: { thumb: "any", index: "any", middle: true, ring: true, pinky: true },
    maxThumbIndexDistance: 0.5,
  },
];

/** Tie-breaking order: earlier entries win. More-specific gestures first. */
export const GESTURE_PRIORITY: GestureId[] = [
  "ok-sign",
  "thumbs-up",
  "fist",
  "open-palm",
  "four-fingers",
  "index-middle-ring",
  "index-middle",
  "index",
];
