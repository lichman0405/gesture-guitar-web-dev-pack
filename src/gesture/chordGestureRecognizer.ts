import type { HandFeatures, GestureCandidate } from "./gestureTypes";
import { GESTURE_RULES, GESTURE_PRIORITY } from "./gestureVocabulary";

/** Exact pose matching: ambiguous/bending fingers retain the previous chord via debounce. */
export class ChordGestureRecognizer {
  classify(features: HandFeatures): GestureCandidate | null {
    const values = [features.thumbIndexTipDistance, features.curlAmount, features.handScale,
      ...Object.values(features.tipDistances), ...Object.values(features.extension ?? {})];
    if (!values.every(Number.isFinite) || features.handScale <= 0) return null;
    let best: GestureCandidate | null = null;
    for (const id of GESTURE_PRIORITY) {
      const rule = GESTURE_RULES.find((r) => r.id === id)!;
      if (rule.minIndexPipAngle !== undefined &&
        (features.indexPipAngle === undefined || !Number.isFinite(features.indexPipAngle) || features.indexPipAngle < rule.minIndexPipAngle)) continue;
      if (rule.maxThumbIndexDistance !== undefined && features.thumbIndexTipDistance > rule.maxThumbIndexDistance) continue;
      if (rule.minCurl !== undefined && features.curlAmount < rule.minCurl) continue;
      if (rule.maxCurl !== undefined && features.curlAmount > rule.maxCurl) continue;
      let confidence = 1;
      let matches = true;
      for (const key of ["thumb", "index", "middle", "ring", "pinky"] as const) {
        const expected = rule.fingers[key];
        if (expected === "any") continue;
        if (features.fingers[key] !== expected) { matches = false; break; }
        const strength = features.extension?.[key];
        if (strength !== undefined) {
          // Do not turn a half-bent finger into a confidently different pose.
          const certainty = expected ? strength : 1 - strength;
          if (certainty < 0.62) { matches = false; break; }
          confidence = Math.min(confidence, 0.6 + 0.4 * (certainty - 0.62) / 0.38);
        }
      }
      if (!matches) continue;
      if (rule.maxThumbIndexDistance !== undefined) {
        confidence = Math.min(confidence, 1 - 0.35 * features.thumbIndexTipDistance / rule.maxThumbIndexDistance);
        // Pinch takes precedence over the thumb-folded four-finger pose.
        return { gestureId: id, confidence };
      }
      if (!best || confidence > best.confidence) best = { gestureId: id, confidence };
    }
    return best;
  }
}
