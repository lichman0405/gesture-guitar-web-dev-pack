/** Rotation- and scale-independent joint geometry; no screen-axis finger tests. */
import { LandmarkIndex } from "../vision/types";
import type { Point3 } from "../vision/types";
import type { FingerExtension, HandFeatures, NormalizedHand } from "./gestureTypes";

export function dist(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function jointAngleDegrees(a: Point3, b: Point3, c: Point3): number {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const lengths = dist(a, b) * dist(b, c);
  if (lengths < 1e-8) return 0;
  const cosine = (ba.x * bc.x + ba.y * bc.y + ba.z * bc.z) / lengths;
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

const ramp = (value: number, low: number, high: number) =>
  Math.max(0, Math.min(1, (value - low) / (high - low)));
const LONG_FINGERS = ["index", "middle", "ring", "pinky"] as const;

export function extractHandFeatures(hand: NormalizedHand): HandFeatures {
  const p = hand.landmarks;
  const wrist = p[LandmarkIndex.WRIST];
  const tipDistances = {
    thumb: dist(p[4], wrist), index: dist(p[8], wrist), middle: dist(p[12], wrist),
    ring: dist(p[16], wrist), pinky: dist(p[20], wrist),
  };
  const extension = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
  const fingers: FingerExtension = { thumb: false, index: false, middle: false, ring: false, pinky: false };
  for (let i = 0; i < LONG_FINGERS.length; i++) {
    const name = LONG_FINGERS[i];
    const mcp = p[5 + i * 4], pip = p[6 + i * 4], dip = p[7 + i * 4], tip = p[8 + i * 4];
    const length = dist(mcp, pip) + dist(pip, dip) + dist(dip, tip);
    const reach = length > 1e-8 ? dist(mcp, tip) / length : 0;
    // A straight PIP alone also occurs with a curled DIP or folded MCP.
    // All three cues must agree; short little fingers need no wrist-distance cutoff.
    const outward = jointAngleDegrees(wrist, mcp, pip);
    extension[name] = Math.min(
      ramp(jointAngleDegrees(mcp, pip, dip), 105, 155),
      ramp(jointAngleDegrees(pip, dip, tip), 100, 150),
      ramp(reach, 0.55, 0.9),
      ramp(outward, 65, 115),
    );
    fingers[name] = extension[name] >= 0.5;
  }
  const thumbLength = dist(p[1], p[2]) + dist(p[2], p[3]) + dist(p[3], p[4]);
  extension.thumb = Math.min(
    ramp(jointAngleDegrees(p[1], p[2], p[3]), 130, 160),
    ramp(jointAngleDegrees(p[2], p[3], p[4]), 125, 160),
    ramp(thumbLength > 1e-8 ? dist(p[1], p[4]) / thumbLength : 0, 0.55, 0.9),
    ramp(dist(p[4], p[5]), 0.25, 0.6),
  );
  const thumbIndexTipDistance = dist(p[4], p[8]);
  // Joint straightness alone cannot distinguish an L from a thumb resting
  // across folded fingers. Use the hand's own radial axis, independent of
  // camera rotation, handedness and 3-D tilt. Both the tip and distal thumb
  // must actually extend toward the outside of the index side of the palm.
  const palmWidth = dist(p[5], p[17]);
  const radial = { x: p[5].x - p[17].x, y: p[5].y - p[17].y, z: p[5].z - p[17].z };
  const radialReach = (origin: Point3) => palmWidth > 1e-8
    ? ((p[4].x - origin.x) * radial.x + (p[4].y - origin.y) * radial.y + (p[4].z - origin.z) * radial.z) / (palmWidth * palmWidth)
    : 0;
  const thumbSpread = Math.min(radialReach(p[5]), radialReach(p[2]));
  // A touching thumb and index is a pinch, not an abducted thumb.
  if (thumbIndexTipDistance < 0.3) extension.thumb = 0;
  fingers.thumb = extension.thumb >= 0.5;
  return {
    physical: hand.physical, t: hand.t, fingers, extension, tipDistances,
    thumbIndexTipDistance,
    indexPipAngle: jointAngleDegrees(p[5], p[6], p[7]),
    thumbSpread,
    curlAmount: LONG_FINGERS.reduce((sum, name) => sum + 1 - extension[name], 0) / 4,
    handScale: hand.scale, wristRaw: hand.wristRaw, palmCenterRaw: hand.palmCenterRaw,
  };
}
