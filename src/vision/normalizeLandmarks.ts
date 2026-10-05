/**
 * Normalize raw hand landmarks to a wrist-centered, scale-invariant frame.
 */

import {
  HAND_LANDMARK_COUNT,
  LandmarkIndex,
} from "./types";
import type { NormalizedHand } from "../gesture/gestureTypes";
import type { Point3, TrackedHand } from "./types";

/**
 * Compute the palm center as the mean of the wrist and the four MCP joints.
 */
export function palmCenter(landmarks: Point3[]): Point3 {
  const indices = [
    LandmarkIndex.WRIST,
    LandmarkIndex.INDEX_MCP,
    LandmarkIndex.MIDDLE_MCP,
    LandmarkIndex.RING_MCP,
    LandmarkIndex.PINKY_MCP,
  ];
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const i of indices) {
    const p = landmarks[i];
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  return {
    x: sx / indices.length,
    y: sy / indices.length,
    z: sz / indices.length,
  };
}

/**
 * Compute hand scale as the Euclidean distance from wrist to middle MCP.
 * Guards against degenerate hands by returning a minimum of 1e-6.
 */
export function handScale(landmarks: Point3[]): number {
  const wrist = landmarks[LandmarkIndex.WRIST];
  const middleMcp = landmarks[LandmarkIndex.MIDDLE_MCP];
  const dx = wrist.x - middleMcp.x;
  const dy = wrist.y - middleMcp.y;
  const dz = wrist.z - middleMcp.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return d < 1e-6 ? 1e-6 : d;
}

/**
 * Normalize a single tracked hand.
 *
 * @throws If the landmark count is not exactly 21.
 */
export function normalizeHand(hand: TrackedHand, t: number, aspectRatio = 1): NormalizedHand {
  const { landmarks, physical } = hand;
  if (landmarks.length !== HAND_LANDMARK_COUNT) {
    throw new Error(
      `Expected ${HAND_LANDMARK_COUNT} landmarks, got ${landmarks.length}`,
    );
  }
  const scale = handScale(landmarks);
  const wristRaw = { ...landmarks[LandmarkIndex.WRIST] };
  const palmCenterRaw = palmCenter(landmarks);
  // x and z use image-width units; y uses image-height units. Prefer metric
  // model geometry so tilting the palm does not flatten the finger joints.
  const world = hand.worldLandmarks;
  const geometry = world?.length === HAND_LANDMARK_COUNT && world.every(isFinitePoint) && handScale(world) > 1e-5
    ? world : landmarks.map((p) => ({ x: p.x * aspectRatio, y: p.y, z: p.z * aspectRatio }));
  const origin = geometry[0];
  const geometryScale = handScale(geometry);
  const normalized = geometry.map((p) => ({
    x: (p.x - origin.x) / geometryScale,
    y: (p.y - origin.y) / geometryScale,
    z: (p.z - origin.z) / geometryScale,
  }));

  return {
    physical,
    landmarks: normalized,
    scale,
    wristRaw,
    palmCenterRaw,
    strumPointRaw: {
      x: (landmarks[5].x + landmarks[9].x) / 2,
      y: (landmarks[5].y + landmarks[9].y) / 2,
      z: (landmarks[5].z + landmarks[9].z) / 2,
    },
    t,
  };
}

/**
 * Normalize an array of tracked hands for a single frame.
 */
export function normalizeFrameHands(
  hands: TrackedHand[],
  t: number,
  aspectRatio = 1,
): NormalizedHand[] {
  return hands.filter((h) => h.landmarks.length === HAND_LANDMARK_COUNT &&
    h.landmarks.every(isFinitePoint) && handScale(h.landmarks) > 1e-5)
    .map((h) => normalizeHand(h, t, aspectRatio));
}

function isFinitePoint(p: Point3): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
