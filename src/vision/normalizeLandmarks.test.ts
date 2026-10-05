import { describe, expect, it } from "vitest";
import {
  handScale,
  normalizeFrameHands,
  normalizeHand,
  palmCenter,
} from "./normalizeLandmarks";
import { extractHandFeatures } from "../gesture/gestureFeatures";
import {
  buildGestureHand,
  buildSyntheticHand,
} from "../debug/syntheticLandmarks";
import type { Point3, TrackedHand } from "./types";

function makeHand(landmarks: Point3[]): TrackedHand {
  return { physical: "Right", landmarks, score: 1.0 };
}

describe("palmCenter", () => {
  it("returns the mean of wrist and the four MCP joints", () => {
    const landmarks: Point3[] = Array.from({ length: 21 }, (_, i) => ({
      x: i,
      y: i * 2,
      z: i * 3,
    }));
    const center = palmCenter(landmarks);
    const sumX = 0 + 5 + 9 + 13 + 17;
    const sumY = 0 + 10 + 18 + 26 + 34;
    const sumZ = 0 + 15 + 27 + 39 + 51;
    expect(center.x).toBeCloseTo(sumX / 5);
    expect(center.y).toBeCloseTo(sumY / 5);
    expect(center.z).toBeCloseTo(sumZ / 5);
  });
});

describe("handScale", () => {
  it("computes wrist-to-middle-MCP Euclidean distance", () => {
    const landmarks: Point3[] = Array.from({ length: 21 }, () => ({
      x: 0,
      y: 0,
      z: 0,
    }));
    landmarks[0] = { x: 0, y: 0, z: 0 };
    landmarks[9] = { x: 3, y: 4, z: 0 };
    expect(handScale(landmarks)).toBeCloseTo(5);
  });

  it("guards degenerate input with a floor of 1e-6", () => {
    const landmarks: Point3[] = Array.from({ length: 21 }, () => ({
      x: 0,
      y: 0,
      z: 0,
    }));
    expect(handScale(landmarks)).toBe(1e-6);
  });
});

describe("normalizeHand", () => {
  it("throws when landmark count is not 21", () => {
    const hand = makeHand([]);
    expect(() => normalizeHand(hand, 0)).toThrow();
  });

  it("centers wrist at origin and scales by handScale", () => {
    const landmarks: Point3[] = Array.from({ length: 21 }, () => ({
      x: 0,
      y: 0,
      z: 0,
    }));
    landmarks[0] = { x: 1, y: 1, z: 1 };
    landmarks[9] = { x: 1, y: 3, z: 1 }; // distance = 2
    landmarks[5] = { x: 0, y: 1, z: 1 };
    landmarks[13] = { x: 2, y: 1, z: 1 };
    landmarks[17] = { x: 1, y: 0, z: 1 };

    const hand = makeHand(landmarks);
    const norm = normalizeHand(hand, 7);

    expect(norm.scale).toBeCloseTo(2);
    expect(norm.wristRaw).toEqual({ x: 1, y: 1, z: 1 });
    expect(norm.landmarks[0]).toEqual({ x: 0, y: 0, z: 0 });
    const mcp = norm.landmarks[9];
    expect(Math.sqrt(mcp.x ** 2 + mcp.y ** 2 + mcp.z ** 2)).toBeCloseTo(1);
    expect(norm.landmarks[5].x).toBeCloseTo((0 - 1) / 2);
    expect(norm.t).toBe(7);
  });
});

describe("normalizeFrameHands", () => {
  it("normalizes an array of hands", () => {
    const h1 = makeHand(
      Array.from({ length: 21 }, (_, i) => ({ x: i, y: 0, z: 0 })),
    );
    const h2 = makeHand(
      Array.from({ length: 21 }, (_, i) => ({ x: -i, y: 0, z: 0 })),
    );
    const norms = normalizeFrameHands([h1, h2], 3);
    expect(norms).toHaveLength(2);
    expect(norms[0].t).toBe(3);
    expect(norms[1].t).toBe(3);
  });
});

describe("synthetic hand round-trip", () => {
  it("produces wrist at origin and middle MCP at unit distance after normalization", () => {
    const hand = buildSyntheticHand({ scale: 0.2 });
    const norm = normalizeHand(hand, 0);
    expect(norm.landmarks[0].x).toBeCloseTo(0);
    expect(norm.landmarks[0].y).toBeCloseTo(0);
    expect(norm.landmarks[0].z).toBeCloseTo(0);
    const mcp = norm.landmarks[9];
    expect(Math.sqrt(mcp.x ** 2 + mcp.y ** 2 + mcp.z ** 2)).toBeCloseTo(1);
  });
});

describe("feature extraction on gesture presets", () => {
  const cases: Array<{
    gesture: Parameters<typeof buildGestureHand>[0];
    expected: Record<"thumb" | "index" | "middle" | "ring" | "pinky", boolean>;
  }> = [
    {
      gesture: "open-palm",
      expected: {
        thumb: true,
        index: true,
        middle: true,
        ring: true,
        pinky: true,
      },
    },
    {
      gesture: "fist",
      expected: {
        thumb: false,
        index: false,
        middle: false,
        ring: false,
        pinky: false,
      },
    },
    {
      gesture: "index",
      expected: {
        thumb: false,
        index: true,
        middle: false,
        ring: false,
        pinky: false,
      },
    },
    {
      gesture: "index-middle",
      expected: {
        thumb: false,
        index: true,
        middle: true,
        ring: false,
        pinky: false,
      },
    },
    {
      gesture: "index-middle-ring",
      expected: {
        thumb: false,
        index: true,
        middle: true,
        ring: true,
        pinky: false,
      },
    },
    {
      gesture: "four-fingers",
      expected: {
        thumb: false,
        index: true,
        middle: true,
        ring: true,
        pinky: true,
      },
    },
    {
      gesture: "thumbs-up",
      expected: {
        thumb: true,
        index: false,
        middle: false,
        ring: false,
        pinky: false,
      },
    },
  ];

  for (const { gesture, expected } of cases) {
    it(`${gesture} produces expected extensions`, () => {
      const hand = buildGestureHand(gesture);
      const norm = normalizeHand(hand, 0);
      const features = extractHandFeatures(norm);
      expect(features.fingers).toEqual(expected);
    });
  }

  it("ok-sign has thumbIndexTipDistance < 0.5 and middle/ring/pinky extended", () => {
    const hand = buildGestureHand("ok-sign");
    const norm = normalizeHand(hand, 0);
    const features = extractHandFeatures(norm);
    expect(features.thumbIndexTipDistance).toBeLessThan(0.5);
    expect(features.fingers.middle).toBe(true);
    expect(features.fingers.ring).toBe(true);
    expect(features.fingers.pinky).toBe(true);
    expect(features.fingers.index).toBe(false);
    expect(features.fingers.thumb).toBe(false);
  });

  it("fist has high curl amount", () => {
    const hand = buildGestureHand("fist");
    const norm = normalizeHand(hand, 0);
    const features = extractHandFeatures(norm);
    expect(features.curlAmount).toBeGreaterThan(0.9);
  });

  it("open-palm has low curl amount", () => {
    const hand = buildGestureHand("open-palm");
    const norm = normalizeHand(hand, 0);
    const features = extractHandFeatures(norm);
    expect(features.curlAmount).toBeLessThan(0.1);
  });
});
