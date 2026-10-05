import { describe, expect, it } from "vitest";
import { buildGestureHand, buildSyntheticHand } from "../debug/syntheticLandmarks";
import { normalizeHand, normalizeFrameHands } from "../vision/normalizeLandmarks";
import type { Point3, PhysicalHand } from "../vision/types";
import { extractHandFeatures } from "./gestureFeatures";
import { ChordGestureRecognizer } from "./chordGestureRecognizer";
import { GESTURE_IDS } from "./gestureTypes";

const recognizer = new ChordGestureRecognizer();
const classify = (hand: ReturnType<typeof buildGestureHand>, aspect = 1) =>
  recognizer.classify(extractHandFeatures(normalizeHand(hand, 0, aspect)));

function rotate(p: Point3, angle: number, tilt: number): Point3 {
  const x = p.x * Math.cos(angle) - p.y * Math.sin(angle);
  const y = p.x * Math.sin(angle) + p.y * Math.cos(angle);
  return { x, y: y * Math.cos(tilt) - p.z * Math.sin(tilt), z: y * Math.sin(tilt) + p.z * Math.cos(tilt) };
}

describe("landmark to gesture regression", () => {
  for (const physical of ["Left", "Right"] as PhysicalHand[]) {
    for (const gesture of GESTURE_IDS) {
      it(`${physical}: ${gesture} survives rotation, tilt, scale and landmark jitter`, () => {
        const source = buildGestureHand(gesture, { physical, wrist: { x: 0, y: 0, z: 0 }, scale: 1 });
        for (const angle of [-1.2, 0, 1.2]) {
          for (const tilt of [-0.8, 0, 0.8]) {
            const worldLandmarks = source.landmarks.map((p, i) => {
              const r = rotate(p, angle, tilt);
              return { x: r.x + Math.sin(i * 7) * 0.002, y: r.y + Math.cos(i * 9) * 0.002, z: r.z };
            });
            for (const scale of [0.09, 0.23]) {
              // Project into a 16:9 image; metric geometry is not foreshortened.
              const landmarks = worldLandmarks.map((p) => ({ x: 0.5 + p.x * scale / (16 / 9), y: 0.7 + p.y * scale, z: p.z * scale / (16 / 9) }));
              const result = classify({ ...source, landmarks, worldLandmarks }, 16 / 9);
              expect(result?.gestureId, `${gesture} angle=${angle} tilt=${tilt}`).toBe(gesture);
              expect(result!.confidence).toBeGreaterThanOrEqual(0.6);
            }
          }
        }
      });
    }
  }

  it("accepts a naturally short upright thumb without a wrist-distance requirement", () => {
    const hand = buildGestureHand("thumbs-up", { wrist: { x: 0, y: 0, z: 0 }, scale: 1 });
    [hand.landmarks[1], hand.landmarks[2], hand.landmarks[3], hand.landmarks[4]] = [
      { x: -0.4, y: 0, z: 0 }, { x: -0.55, y: -0.17, z: 0 },
      { x: -0.7, y: -0.33, z: 0 }, { x: -0.85, y: -0.5, z: 0 },
    ];
    const f = extractHandFeatures(normalizeHand(hand, 0));
    expect(f.tipDistances.thumb).toBeLessThan(1.15); // original algorithm rejected this
    expect(recognizer.classify(f)?.gestureId).toBe("thumbs-up");
    // The same relaxed thumb on an open hand must distinguish five vs four.
    const open = buildGestureHand("open-palm", { wrist: { x: 0, y: 0, z: 0 }, scale: 1 });
    open.landmarks.splice(1, 4, ...hand.landmarks.slice(1, 5));
    expect(classify(open)?.gestureId).toBe("open-palm");
  });

  it("rejects an index with straight PIP but folded fingertip", () => {
    const hand = buildGestureHand("index", { wrist: { x: 0, y: 0, z: 0 }, scale: 1 });
    hand.landmarks[8] = { ...hand.landmarks[6], z: 0.02 };
    const f = extractHandFeatures(normalizeHand(hand, 0));
    expect(f.fingers.index).toBe(false);
    expect(recognizer.classify(f)?.gestureId).not.toBe("index");
  });

  it("does not confidently map an unassigned finger mask to a nearby chord", () => {
    const hand = buildSyntheticHand({ fingerCurls: { thumb: 0.8, middle: 1, pinky: 1 } });
    expect(classify(hand)).toBeNull(); // index + ring, not in vocabulary
  });

  it("holds ambiguity while a finger is half bent", () => {
    const hand = buildGestureHand("index-middle", { fingerCurls: { middle: 0.5 } });
    const f = extractHandFeatures(normalizeHand(hand, 0));
    expect(f.extension!.middle).toBeGreaterThan(0.38);
    expect(f.extension!.middle).toBeLessThan(0.62);
    expect(recognizer.classify(f)).toBeNull();
  });

  it("corrects image aspect ratio when metric landmarks are absent", () => {
    const source = buildGestureHand("thumbs-up", { wrist: { x: 0, y: 0, z: 0 }, scale: 1 });
    const landmarks = source.landmarks.map((p) => ({ x: p.x / 2, y: p.y, z: p.z / 2 }));
    expect(classify({ ...source, landmarks }, 2)?.gestureId).toBe("thumbs-up");
  });

  it("filters invalid/degenerate observations and falls back from invalid world landmarks", () => {
    const hand = buildGestureHand("open-palm");
    expect(classify({ ...hand, worldLandmarks: hand.landmarks.map(() => ({ x: NaN, y: 0, z: 0 })) })?.gestureId).toBe("open-palm");
    const invalid = { ...hand, landmarks: hand.landmarks.map(() => ({ x: NaN, y: 0, z: 0 })) };
    expect(normalizeFrameHands([hand, invalid], 0)).toHaveLength(1);
  });
});
