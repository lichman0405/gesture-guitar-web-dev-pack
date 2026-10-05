import type { PhysicalHand, Point3, TrackedHand } from "./types";

/** Keep physical hand identities through short handedness-label flicker.
 * Match by wrist continuity, with the model label as a prior. Expire quickly
 * on loss so a newly appearing hand can establish its own identity. */
export class HandIdentityTracker {
  private previous = new Map<PhysicalHand, { wrist: Point3; t: number }>();
  private lastT = -Infinity;

  update(hands: TrackedHand[], t: number): TrackedHand[] {
    if (t < this.lastT) this.reset();
    this.lastT = t;
    for (const [id, track] of this.previous) {
      if (t - track.t > 0.4) this.previous.delete(id);
    }
    const valid = hands.filter((hand) => hand.landmarks.length === 21 &&
      hand.landmarks.every((p) => [p.x, p.y, p.z].every(Number.isFinite))).slice(0, 2);
    const cost = (hand: TrackedHand, physical: PhysicalHand) => {
      const prior = this.previous.get(physical);
      const labelPenalty = hand.physical === physical ? 0 : 0.04 * Math.max(0.25, hand.score);
      if (!prior) return hand.physical === physical ? 0.03 : 0.25;
      const p = hand.landmarks[0];
      return (p.x - prior.wrist.x) ** 2 + (p.y - prior.wrist.y) ** 2 + labelPenalty;
    };
    let identities: PhysicalHand[];
    if (valid.length === 2) {
      const normal = cost(valid[0], "Left") + cost(valid[1], "Right");
      const reversed = cost(valid[0], "Right") + cost(valid[1], "Left");
      identities = normal <= reversed ? ["Left", "Right"] : ["Right", "Left"];
    } else if (valid.length === 1) {
      identities = [cost(valid[0], "Left") <= cost(valid[0], "Right") ? "Left" : "Right"];
    } else return [];
    return valid.map((hand, i) => {
      const physical = identities[i];
      this.previous.set(physical, { wrist: { ...hand.landmarks[0] }, t });
      return hand.physical === physical ? hand : { ...hand, physical };
    });
  }

  reset(): void { this.previous.clear(); this.lastT = -Infinity; }
}
