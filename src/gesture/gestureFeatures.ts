/**
 * Extract classification-ready features from a normalized hand.
 */

import { LandmarkIndex } from "../vision/types";
import type { Point3 } from "../vision/types";
import type { FingerExtension, HandFeatures, NormalizedHand } from "./gestureTypes";

/** Data-driven thresholds for finger extension and curl. */
export const FEATURE_THRESHOLDS = {
  finger: {
    angleStraightMinDeg: 150,
    tipDistanceMin: 1.5,
  },
  thumb: {
    tipDistanceMin: 1.15,
    indexMcpDistanceMin: 0.9,
  },
  curl: {
    extendedDistance: 1.7,
    curledDistance: 0.9,
  },
} as const;

/** Euclidean distance between two 3-D points. */
export function dist(a: Point3, b: Point3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Compute the interior angle (in degrees) at point `b` formed by a-b-c.
 */
export function jointAngleDegrees(a: Point3, b: Point3, c: Point3): number {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z);
  if (magBA === 0 || magBC === 0) return 0;
  let cosTheta = dot / (magBA * magBC);
  cosTheta = Math.max(-1, Math.min(1, cosTheta));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Derive scale-normalized features from a normalized hand.
 */
export function extractHandFeatures(hand: NormalizedHand): HandFeatures {
  const { landmarks, physical, scale, wristRaw, palmCenterRaw, t } = hand;

  const tipIdx = {
    thumb: LandmarkIndex.THUMB_TIP,
    index: LandmarkIndex.INDEX_TIP,
    middle: LandmarkIndex.MIDDLE_TIP,
    ring: LandmarkIndex.RING_TIP,
    pinky: LandmarkIndex.PINKY_TIP,
  };

  const mcpIdx = {
    index: LandmarkIndex.INDEX_MCP,
    middle: LandmarkIndex.MIDDLE_MCP,
    ring: LandmarkIndex.RING_MCP,
    pinky: LandmarkIndex.PINKY_MCP,
  };

  const pipIdx = {
    index: LandmarkIndex.INDEX_PIP,
    middle: LandmarkIndex.MIDDLE_PIP,
    ring: LandmarkIndex.RING_PIP,
    pinky: LandmarkIndex.PINKY_PIP,
  };

  const dipIdx = {
    index: LandmarkIndex.INDEX_DIP,
    middle: LandmarkIndex.MIDDLE_DIP,
    ring: LandmarkIndex.RING_DIP,
    pinky: LandmarkIndex.PINKY_DIP,
  };

  const tipDistances = {
    thumb: dist(landmarks[tipIdx.thumb], landmarks[LandmarkIndex.WRIST]),
    index: dist(landmarks[tipIdx.index], landmarks[LandmarkIndex.WRIST]),
    middle: dist(landmarks[tipIdx.middle], landmarks[LandmarkIndex.WRIST]),
    ring: dist(landmarks[tipIdx.ring], landmarks[LandmarkIndex.WRIST]),
    pinky: dist(landmarks[tipIdx.pinky], landmarks[LandmarkIndex.WRIST]),
  };

  const fingers: FingerExtension = {
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false,
  };

  const fingerNames: Array<"index" | "middle" | "ring" | "pinky"> = [
    "index",
    "middle",
    "ring",
    "pinky",
  ];

  for (const name of fingerNames) {
    const angle = jointAngleDegrees(
      landmarks[mcpIdx[name]],
      landmarks[pipIdx[name]],
      landmarks[dipIdx[name]],
    );
    const extendedByAngle =
      angle > FEATURE_THRESHOLDS.finger.angleStraightMinDeg;
    const extendedByDist =
      tipDistances[name] > FEATURE_THRESHOLDS.finger.tipDistanceMin;
    fingers[name] = extendedByAngle || extendedByDist;
  }

  const thumbTipToWrist = tipDistances.thumb;
  const thumbTipToIndexMcp = dist(
    landmarks[tipIdx.thumb],
    landmarks[mcpIdx.index],
  );
  fingers.thumb =
    thumbTipToWrist > FEATURE_THRESHOLDS.thumb.tipDistanceMin &&
    thumbTipToIndexMcp > FEATURE_THRESHOLDS.thumb.indexMcpDistanceMin;

  const thumbIndexTipDistance = dist(
    landmarks[tipIdx.thumb],
    landmarks[tipIdx.index],
  );

  const curlRange =
    FEATURE_THRESHOLDS.curl.extendedDistance -
    FEATURE_THRESHOLDS.curl.curledDistance;
  let curlSum = 0;
  for (const name of fingerNames) {
    const c = clamp01(
      (FEATURE_THRESHOLDS.curl.extendedDistance - tipDistances[name]) /
        curlRange,
    );
    curlSum += c;
  }
  const curlAmount = curlSum / fingerNames.length;

  return {
    physical,
    t,
    fingers,
    tipDistances,
    thumbIndexTipDistance,
    curlAmount,
    handScale: scale,
    wristRaw,
    palmCenterRaw,
  };
}
