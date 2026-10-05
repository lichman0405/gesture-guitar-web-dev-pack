import { describe, expect, it } from "vitest";
import { buildGestureHand } from "../debug/syntheticLandmarks";
import { normalizeHand } from "../vision/normalizeLandmarks";
import type { PhysicalHand } from "../vision/types";
import { extractHandFeatures } from "./gestureFeatures";
import { ChordGestureRecognizer } from "./chordGestureRecognizer";

function naturalPointingHand(physical: PhysicalHand) {
  const hand = buildGestureHand("index", { physical, wrist: { x: 0, y: 0, z: 0 }, scale: 1 });
  const sign = physical === "Right" ? 1 : -1;
  // The thumb can be almost straight while resting ACROSS the folded fingers.
  hand.landmarks.splice(1, 4, ...[
    { x: -0.3 * sign, y: 0, z: 0 }, { x: -0.05 * sign, y: -0.19, z: 0 },
    { x: 0.25 * sign, y: -0.42, z: 0 }, { x: 0.55 * sign, y: -0.65, z: 0 },
  ]);
  return hand;
}

const recognize = (hand: ReturnType<typeof buildGestureHand>) =>
  new ChordGestureRecognizer().classify(extractHandFeatures(normalizeHand(hand, 0)));

describe("natural pointing and rock poses", () => {
  for (const physical of ["Left", "Right"] as const) {
    it(`${physical}: a thumb resting across folded fingers means C, not L/Cm`, () => {
      const hand = naturalPointingHand(physical);
      expect(extractHandFeatures(normalizeHand(hand, 0)).fingers.thumb).toBe(true); // reproduces the old false Cm
      expect(recognize(hand)?.gestureId).toBe("index");
    });
    it(`${physical}: a clearly spread L still means Cm`, () => {
      expect(recognize(buildGestureHand("thumb-index", { physical }))?.gestureId).toBe("thumb-index");
    });
    it(`${physical}: rock works when the thumb is relaxed or extended`, () => {
      const hand = buildGestureHand("index-pinky", { physical, fingerCurls: { thumb: 0 } });
      expect(recognize(hand)?.gestureId).toBe("index-pinky");
    });
    it(`${physical}: rock tolerates the ring finger's natural partial bend`, () => {
      const hand = buildGestureHand("index-pinky", { physical, fingerCurls: { ring: 0.5 } });
      expect(recognize(hand)?.gestureId).toBe("index-pinky");
    });
    it(`${physical}: a sideways-splayed but straight little finger still means rock`, () => {
      const hand = buildGestureHand("index-pinky", { physical, wrist: { x: 0, y: 0, z: 0 }, scale: 1 });
      const mcp = hand.landmarks[17];
      const outward = { x: -mcp.y, y: mcp.x, z: 0 };
      const length = Math.hypot(outward.x, outward.y);
      [0.3, 0.56, 0.75].forEach((distance, i) => {
        hand.landmarks[18 + i] = { x: mcp.x + outward.x / length * distance,
          y: mcp.y + outward.y / length * distance, z: 0 };
      });
      const features = extractHandFeatures(normalizeHand(hand, 0));
      expect(features.extension!.pinky).toBeCloseTo(0.5);
      expect(recognize(hand)?.gestureId).toBe("index-pinky");
    });
    it(`${physical}: resting thumbs remain C through 3-D rotation and jitter`, () => {
      const source = naturalPointingHand(physical);
      for (const angle of [-1, 0, 1]) {
        const worldLandmarks = source.landmarks.map((p, i) => {
          const x = p.x * Math.cos(angle) - p.y * Math.sin(angle);
          const y = p.x * Math.sin(angle) + p.y * Math.cos(angle);
          return { x: x + Math.sin(i) * 0.003, y: y * 0.7, z: y * Math.sqrt(0.51) };
        });
        expect(recognize({ ...source, worldLandmarks })?.gestureId).toBe("index");
      }
    });
  }
  it("does not call a fully open hand or a half-bent index rock", () => {
    expect(recognize(buildGestureHand("open-palm"))?.gestureId).toBe("open-palm");
    expect(recognize(buildGestureHand("index-pinky", { fingerCurls: { index: 0.5 } }))?.gestureId).not.toBe("index-pinky");
  });
});
