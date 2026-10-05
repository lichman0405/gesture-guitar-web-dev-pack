import { describe, it, expect } from "vitest";
import type { HandFeatures } from "./gestureTypes.ts";
import { ChordGestureRecognizer } from "./chordGestureRecognizer.ts";

function makeFeatures(overrides: Partial<HandFeatures> = {}): HandFeatures {
  return {
    physical: "Right",
    t: 0,
    fingers: {
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
    },
    tipDistances: {
      thumb: 1.0,
      index: 1.0,
      middle: 1.0,
      ring: 1.0,
      pinky: 1.0,
    },
    thumbIndexTipDistance: 1.5,
    curlAmount: 0.9,
    handScale: 1,
    wristRaw: { x: 0.5, y: 0.5, z: 0 },
    palmCenterRaw: { x: 0.5, y: 0.5, z: 0 },
    ...overrides,
  } as HandFeatures;
}

describe("ChordGestureRecognizer", () => {
  const recognizer = new ChordGestureRecognizer();

  it("classifies open-palm with high confidence", () => {
    const features = makeFeatures({
      fingers: { thumb: true, index: true, middle: true, ring: true, pinky: true },
      tipDistances: { thumb: 1.8, index: 1.8, middle: 1.8, ring: 1.8, pinky: 1.8 },
      curlAmount: 0.05,
    });
    const result = recognizer.classify(features);
    expect(result).not.toBeNull();
    expect(result!.gestureId).toBe("open-palm");
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it("classifies fist", () => {
    const features = makeFeatures({
      fingers: { thumb: false, index: false, middle: false, ring: false, pinky: false },
      tipDistances: { thumb: 0.8, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.8 },
      curlAmount: 0.95,
    });
    const result = recognizer.classify(features);
    expect(result).not.toBeNull();
    expect(result!.gestureId).toBe("fist");
  });

  it("classifies index only", () => {
    const features = makeFeatures({
      fingers: { thumb: false, index: true, middle: false, ring: false, pinky: false },
      tipDistances: { thumb: 0.9, index: 1.8, middle: 0.9, ring: 0.9, pinky: 0.9 },
      curlAmount: 0.3,
    });
    const result = recognizer.classify(features);
    expect(result).not.toBeNull();
    expect(result!.gestureId).toBe("index");
  });

  it("classifies index-middle", () => {
    const features = makeFeatures({
      fingers: { thumb: false, index: true, middle: true, ring: false, pinky: false },
      tipDistances: { thumb: 0.9, index: 1.8, middle: 1.8, ring: 0.9, pinky: 0.9 },
      curlAmount: 0.3,
    });
    const result = recognizer.classify(features);
    expect(result).not.toBeNull();
    expect(result!.gestureId).toBe("index-middle");
  });

  it("classifies index-middle-ring", () => {
    const features = makeFeatures({
      fingers: { thumb: false, index: true, middle: true, ring: true, pinky: false },
      tipDistances: { thumb: 0.9, index: 1.8, middle: 1.8, ring: 1.8, pinky: 0.9 },
      curlAmount: 0.3,
    });
    const result = recognizer.classify(features);
    expect(result).not.toBeNull();
    expect(result!.gestureId).toBe("index-middle-ring");
  });

  it("classifies four-fingers (not open-palm)", () => {
    const features = makeFeatures({
      fingers: { thumb: false, index: true, middle: true, ring: true, pinky: true },
      tipDistances: { thumb: 0.9, index: 1.8, middle: 1.8, ring: 1.8, pinky: 1.8 },
      curlAmount: 0.2,
    });
    const result = recognizer.classify(features);
    expect(result).not.toBeNull();
    expect(result!.gestureId).toBe("four-fingers");
  });

  it("classifies thumbs-up (not fist)", () => {
    const features = makeFeatures({
      fingers: { thumb: true, index: false, middle: false, ring: false, pinky: false },
      tipDistances: { thumb: 1.8, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.8 },
      curlAmount: 0.8,
    });
    const result = recognizer.classify(features);
    expect(result).not.toBeNull();
    expect(result!.gestureId).toBe("thumbs-up");
  });

  it("classifies ok-sign", () => {
    const features = makeFeatures({
      fingers: { thumb: true, index: false, middle: true, ring: true, pinky: true },
      tipDistances: { thumb: 0.8, index: 0.8, middle: 1.8, ring: 1.8, pinky: 1.8 },
      thumbIndexTipDistance: 0.2,
      curlAmount: 0.3,
    });
    const result = recognizer.classify(features);
    expect(result).not.toBeNull();
    expect(result!.gestureId).toBe("ok-sign");
  });

  it("returns null or low confidence for ambiguous pose", () => {
    const features = makeFeatures({
      fingers: { thumb: false, index: true, middle: false, ring: true, pinky: false },
      tipDistances: { thumb: 1.0, index: 1.4, middle: 1.0, ring: 1.4, pinky: 1.0 },
      curlAmount: 0.5,
    });
    const result = recognizer.classify(features);
    if (result !== null) {
      expect(result.confidence).toBeLessThan(0.75);
    }
  });

  it("resolves ties deterministically by priority", () => {
    const features = makeFeatures({
      fingers: { thumb: false, index: true, middle: true, ring: false, pinky: false },
      tipDistances: { thumb: 0.9, index: 1.8, middle: 1.8, ring: 0.9, pinky: 0.9 },
      curlAmount: 0.5,
    });
    const results: (string | null)[] = [];
    for (let i = 0; i < 10; i++) {
      const r = recognizer.classify(features);
      results.push(r?.gestureId ?? null);
    }
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("index-middle");
  });

  it("returns null for NaN distances without throwing", () => {
    const features = makeFeatures({
      thumbIndexTipDistance: NaN,
    });
    expect(() => recognizer.classify(features)).not.toThrow();
    expect(recognizer.classify(features)).toBeNull();
  });
});
