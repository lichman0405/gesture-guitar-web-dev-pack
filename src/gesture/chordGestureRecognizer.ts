import type { HandFeatures, GestureCandidate, GestureId } from "./gestureTypes.ts";
import { GESTURE_RULES, GESTURE_PRIORITY } from "./gestureVocabulary.ts";

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Deterministic geometric chord-gesture classifier.
 *
 * Evaluates a fixed rule table against per-frame HandFeatures and returns
 * the highest-confidence GestureCandidate, or null when no rule is
 * sufficiently matched.
 *
 * Designed for ~30 Hz operation: allocation-light, no globals, no async.
 */
export class ChordGestureRecognizer {
  /**
   * Classify a single frame of hand features.
   *
   * @param features - Normalized hand features for one hand in one frame.
   * @returns The winning gesture candidate, or null if no rule scores >= 0.55.
   */
  classify(features: HandFeatures): GestureCandidate | null {
    if (
      Number.isNaN(features.thumbIndexTipDistance) ||
      Number.isNaN(features.curlAmount) ||
      Number.isNaN(features.handScale) ||
      Number.isNaN(features.tipDistances.thumb) ||
      Number.isNaN(features.tipDistances.index) ||
      Number.isNaN(features.tipDistances.middle) ||
      Number.isNaN(features.tipDistances.ring) ||
      Number.isNaN(features.tipDistances.pinky)
    ) {
      return null;
    }

    let bestScore = -Infinity;
    let bestId: GestureId | null = null;

    for (const rule of GESTURE_RULES) {
      let score = 1.0;

      const fingerKeys = ["thumb", "index", "middle", "ring", "pinky"] as const;
      for (const key of fingerKeys) {
        const expected = rule.fingers[key];
        if (expected !== "any" && features.fingers[key] !== expected) {
          score -= 0.3;
        }
      }

      if (rule.maxThumbIndexDistance !== undefined) {
        const ratio = features.thumbIndexTipDistance / (rule.maxThumbIndexDistance * 2);
        score *= clamp01(1 - ratio);
      }

      if (rule.minCurl !== undefined && features.curlAmount < rule.minCurl) {
        const overshoot = rule.minCurl - features.curlAmount;
        score -= overshoot * 0.6;
      }

      if (rule.maxCurl !== undefined && features.curlAmount > rule.maxCurl) {
        const overshoot = features.curlAmount - rule.maxCurl;
        score -= overshoot * 0.6;
      }

      if (Number.isNaN(score)) continue;

      if (score < bestScore) continue;

      if (score === bestScore && bestId !== null) {
        const currentPriority = GESTURE_PRIORITY.indexOf(rule.id);
        const bestPriority = GESTURE_PRIORITY.indexOf(bestId);
        if (currentPriority > bestPriority) continue;
      }

      bestScore = score;
      bestId = rule.id;
    }

    if (bestId === null || bestScore < 0.55) {
      return null;
    }

    return {
      gestureId: bestId,
      confidence: clamp01(bestScore),
    };
  }
}
