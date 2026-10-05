import { describe, expect, it } from "vitest";
import { HandIdentityTracker } from "./handIdentityTracker";
import { buildGestureHand } from "../debug/syntheticLandmarks";
const left = buildGestureHand("index", { physical: "Left", wrist: { x: 0.25, y: 0.5, z: 0 } });
const right = buildGestureHand("thumbs-up", { physical: "Right", wrist: { x: 0.75, y: 0.5, z: 0 } });

describe("hand identity continuity", () => {
  it("keeps roles when model order changes or both handedness labels flicker", () => {
    const tracker = new HandIdentityTracker();
    expect(tracker.update([left, right], 0).map((h) => h.physical)).toEqual(["Left", "Right"]);
    expect(tracker.update([{ ...right, physical: "Left" }, { ...left, physical: "Right" }], 0.033)
      .map((h) => h.physical)).toEqual(["Right", "Left"]);
  });
  it("matches a remaining hand while the other is briefly occluded", () => {
    const tracker = new HandIdentityTracker();
    tracker.update([left, right], 0);
    expect(tracker.update([{ ...right, physical: "Left" }], 0.1)[0].physical).toBe("Right");
  });
  it("expires tracks and accepts newly appearing handedness", () => {
    const tracker = new HandIdentityTracker();
    tracker.update([left, right], 0);
    expect(tracker.update([{ ...right, physical: "Left" }], 1)[0].physical).toBe("Left");
  });
  it("does not mutate model observations", () => {
    const tracker = new HandIdentityTracker();
    tracker.update([left, right], 0);
    const wrong = { ...right, physical: "Left" as const };
    expect(tracker.update([wrong], 0.1)[0].physical).toBe("Right");
    expect(wrong.physical).toBe("Left");
  });
});
