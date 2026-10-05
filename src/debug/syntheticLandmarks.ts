/**
 * Deterministic synthetic hand generator for tests.
 */

import { HAND_LANDMARK_COUNT, LandmarkIndex } from "../vision/types";
import type { PhysicalHand, Point3, TrackedHand } from "../vision/types";
import type { GestureId } from "../gesture/gestureTypes";

export interface SyntheticHandOptions {
  physical?: PhysicalHand;
  wrist?: Point3;
  scale?: number;
  fingerCurls?: Partial<
    Record<"thumb" | "index" | "middle" | "ring" | "pinky", number>
  >;
  thumbIndexPinch?: boolean;
  t?: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function add(a: Point3, b: Point3): Point3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function mul(a: Point3, s: number): Point3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/** Rotate a 2-D vector clockwise by theta (radians) in screen space (y down). */
function rotateCW(v: Point3, theta: number): Point3 {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
    z: v.z,
  };
}

/**
 * Construct a geometrically plausible 21-landmark hand.
 */
export function buildSyntheticHand(options?: SyntheticHandOptions): TrackedHand {
  const physical = options?.physical ?? "Right";
  const wrist = options?.wrist ?? { x: 0.5, y: 0.5, z: 0 };
  const scale = options?.scale ?? 0.2;
  const fingerCurls = options?.fingerCurls ?? {};
  const thumbIndexPinch = options?.thumbIndexPinch ?? false;

  const handSign = physical === "Right" ? 1 : -1;

  const landmarks: Point3[] = Array.from({ length: HAND_LANDMARK_COUNT }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));

  landmarks[LandmarkIndex.WRIST] = { ...wrist };

  const mcpOffsets: Record<
    "index" | "middle" | "ring" | "pinky",
    Point3
  > = {
    index: { x: -0.25 * handSign, y: -0.95, z: 0 },
    middle: { x: 0, y: -1.0, z: 0 },
    ring: { x: 0.2 * handSign, y: -0.95, z: 0 },
    pinky: { x: 0.45 * handSign, y: -0.85, z: 0 },
  };

  const mcpPositions: Record<
    "index" | "middle" | "ring" | "pinky",
    Point3
  > = {
    index: add(wrist, mul(mcpOffsets.index, scale)),
    middle: add(wrist, mul(mcpOffsets.middle, scale)),
    ring: add(wrist, mul(mcpOffsets.ring, scale)),
    pinky: add(wrist, mul(mcpOffsets.pinky, scale)),
  };

  landmarks[LandmarkIndex.INDEX_MCP] = mcpPositions.index;
  landmarks[LandmarkIndex.MIDDLE_MCP] = mcpPositions.middle;
  landmarks[LandmarkIndex.RING_MCP] = mcpPositions.ring;
  landmarks[LandmarkIndex.PINKY_MCP] = mcpPositions.pinky;

  const fingerDefs: Array<{
    name: "index" | "middle" | "ring" | "pinky";
    mcp: number;
    pip: number;
    dip: number;
    tip: number;
    lengthFactor: number;
  }> = [
    {
      name: "index",
      mcp: LandmarkIndex.INDEX_MCP,
      pip: LandmarkIndex.INDEX_PIP,
      dip: LandmarkIndex.INDEX_DIP,
      tip: LandmarkIndex.INDEX_TIP,
      lengthFactor: 0.95,
    },
    {
      name: "middle",
      mcp: LandmarkIndex.MIDDLE_MCP,
      pip: LandmarkIndex.MIDDLE_PIP,
      dip: LandmarkIndex.MIDDLE_DIP,
      tip: LandmarkIndex.MIDDLE_TIP,
      lengthFactor: 1.0,
    },
    {
      name: "ring",
      mcp: LandmarkIndex.RING_MCP,
      pip: LandmarkIndex.RING_PIP,
      dip: LandmarkIndex.RING_DIP,
      tip: LandmarkIndex.RING_TIP,
      lengthFactor: 0.95,
    },
    {
      name: "pinky",
      mcp: LandmarkIndex.PINKY_MCP,
      pip: LandmarkIndex.PINKY_PIP,
      dip: LandmarkIndex.PINKY_DIP,
      tip: LandmarkIndex.PINKY_TIP,
      lengthFactor: 0.75,
    },
  ];

  const maxMcp = degToRad(70);
  const maxPip = degToRad(100);
  const maxDip = degToRad(90);

  for (const f of fingerDefs) {
    const curl = clamp01(fingerCurls[f.name] ?? 0);
    const totalLen = f.lengthFactor * scale;
    const segLens = [0.4 * totalLen, 0.35 * totalLen, 0.25 * totalLen];
    const baseDir: Point3 = { x: 0, y: -1, z: 0 };

    const dir1 = rotateCW(baseDir, curl * maxMcp);
    const dir2 = rotateCW(baseDir, curl * (maxMcp + maxPip));
    const dir3 = rotateCW(baseDir, curl * (maxMcp + maxPip + maxDip));

    const pMcp = mcpPositions[f.name];
    const pPip = add(pMcp, mul(dir1, segLens[0]));
    const pDip = add(pPip, mul(dir2, segLens[1]));
    const pTip = add(pDip, mul(dir3, segLens[2]));

    landmarks[f.pip] = pPip;
    landmarks[f.dip] = pDip;
    landmarks[f.tip] = pTip;
  }

  // Thumb
  const thumbCurl = clamp01(fingerCurls["thumb"] ?? 0);
  const thumbLen = 0.9 * scale;
  const thumbSegLens = [0.25 * thumbLen, 0.35 * thumbLen, 0.4 * thumbLen];
  const thumbStraightDir: Point3 = { x: -1 * handSign, y: 0, z: 0 };
  const thumbCmcOffset: Point3 = { x: -0.3 * handSign, y: 0, z: 0 };
  const thumbCmc = add(wrist, mul(thumbCmcOffset, scale));

  const thumbMax1 = degToRad(40);
  const thumbMax2 = degToRad(60);
  const thumbMax3 = degToRad(50);

  const tDir1 = rotateCW(thumbStraightDir, thumbCurl * thumbMax1);
  const tDir2 = rotateCW(
    thumbStraightDir,
    thumbCurl * (thumbMax1 + thumbMax2),
  );
  const tDir3 = rotateCW(
    thumbStraightDir,
    thumbCurl * (thumbMax1 + thumbMax2 + thumbMax3),
  );

  const thumbMcp = add(thumbCmc, mul(tDir1, thumbSegLens[0]));
  const thumbIp = add(thumbMcp, mul(tDir2, thumbSegLens[1]));
  let thumbTip = add(thumbIp, mul(tDir3, thumbSegLens[2]));

  if (thumbIndexPinch) {
    const indexTip = landmarks[LandmarkIndex.INDEX_TIP];
    thumbTip = add(indexTip, {
      x: 0.03 * scale,
      y: 0.03 * scale,
      z: 0,
    });
  }

  landmarks[LandmarkIndex.THUMB_CMC] = thumbCmc;
  landmarks[LandmarkIndex.THUMB_MCP] = thumbMcp;
  landmarks[LandmarkIndex.THUMB_IP] = thumbIp;
  landmarks[LandmarkIndex.THUMB_TIP] = thumbTip;

  return {
    physical,
    landmarks,
    score: 1.0,
  };
}

/**
 * Build a synthetic hand matching a named gesture preset.
 */
export function buildGestureHand(
  gesture: GestureId,
  options?: SyntheticHandOptions,
): TrackedHand {
  const baseCurls: Partial<
    Record<"thumb" | "index" | "middle" | "ring" | "pinky", number>
  > = {};
  let thumbIndexPinch = false;

  switch (gesture) {
    case "open-palm":
      // all straight
      break;
    case "fist":
      baseCurls.index = 1;
      baseCurls.middle = 1;
      baseCurls.ring = 1;
      baseCurls.pinky = 1;
      baseCurls.thumb = 0.8;
      break;
    case "index":
      baseCurls.index = 0;
      baseCurls.middle = 1;
      baseCurls.ring = 1;
      baseCurls.pinky = 1;
      baseCurls.thumb = 0.7;
      break;
    case "index-middle":
      baseCurls.index = 0;
      baseCurls.middle = 0;
      baseCurls.ring = 1;
      baseCurls.pinky = 1;
      baseCurls.thumb = 0.7;
      break;
    case "index-middle-ring":
      baseCurls.index = 0;
      baseCurls.middle = 0;
      baseCurls.ring = 0;
      baseCurls.pinky = 1;
      baseCurls.thumb = 0.7;
      break;
    case "four-fingers":
      baseCurls.index = 0;
      baseCurls.middle = 0;
      baseCurls.ring = 0;
      baseCurls.pinky = 0;
      baseCurls.thumb = 1;
      break;
    case "thumbs-up":
      baseCurls.thumb = 0;
      baseCurls.index = 1;
      baseCurls.middle = 1;
      baseCurls.ring = 1;
      baseCurls.pinky = 1;
      break;
    case "ok-sign":
      thumbIndexPinch = true;
      baseCurls.index = 0.7;
      baseCurls.middle = 0;
      baseCurls.ring = 0;
      baseCurls.pinky = 0;
      baseCurls.thumb = 0;
      break;
    case "pick-grip":
      thumbIndexPinch = true;
      baseCurls.index = 0.8;
      baseCurls.middle = baseCurls.ring = baseCurls.pinky = 1;
      baseCurls.thumb = 0;
      break;
    case "pinky":
    case "index-pinky":
    case "thumb-index":
    case "thumb-pinky":
      baseCurls.index = gesture === "index-pinky" || gesture === "thumb-index" ? 0 : 1;
      baseCurls.middle = baseCurls.ring = 1;
      baseCurls.pinky = gesture === "thumb-index" ? 1 : 0;
      baseCurls.thumb = gesture === "thumb-index" || gesture === "thumb-pinky" ? 0 : 0.8;
      break;
  }

  const mergedCurls = { ...baseCurls, ...options?.fingerCurls };
  return buildSyntheticHand({
    ...options,
    fingerCurls: mergedCurls,
    thumbIndexPinch: thumbIndexPinch || options?.thumbIndexPinch,
  });
}
