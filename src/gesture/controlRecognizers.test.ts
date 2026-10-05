import { describe, it, expect } from "vitest";
import { MuteDetector } from "./muteDetector";
import { ControlGestureRecognizer } from "./controlGestureRecognizer";
import { MUTE_GESTURE, OK_GESTURE } from "./gestureTypes";
import type { GestureCandidate, GestureId } from "./gestureTypes";

const STEP = 1 / 30;

function makeCandidate(gestureId: GestureId, confidence = 0.9): GestureCandidate {
  return { gestureId, confidence };
}

describe("MuteDetector", () => {
  it("activates after fist held for activateSeconds and emits once", () => {
    const md = new MuteDetector({ activateSeconds: 0.2, releaseSeconds: 0.25 });
    const events = [];
    for (let f = 0; f <= 8; f++) {
      const e = md.update(makeCandidate(MUTE_GESTURE), f * STEP);
      if (e) events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("mute");
    expect(events[0].t).toBeCloseTo(0.2, 3);
    expect(events[0].active).toBe(true);
    expect(events[0].source).toBe("vision");
    expect(md.active).toBe(true);
  });

  it("emits nothing while continuing to hold after activation", () => {
    const md = new MuteDetector({ activateSeconds: 0.2, releaseSeconds: 0.25 });
    for (let f = 0; f <= 8; f++) md.update(makeCandidate(MUTE_GESTURE), f * STEP);
    expect(md.active).toBe(true);
    const more = [];
    for (let f = 9; f <= 30; f++) {
      const e = md.update(makeCandidate(MUTE_GESTURE), f * STEP);
      if (e) more.push(e);
    }
    expect(more).toHaveLength(0);
  });

  it("releases after non-fist held for releaseSeconds and emits once", () => {
    const md = new MuteDetector({ activateSeconds: 0.2, releaseSeconds: 0.25 });
    for (let f = 0; f <= 6; f++) md.update(makeCandidate(MUTE_GESTURE), f * STEP);
    expect(md.active).toBe(true);
    const events = [];
    for (let f = 7; f <= 18; f++) {
      const e = md.update(null, f * STEP);
      if (e) events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("mute");
    expect(events[0].t).toBeCloseTo(15 * STEP, 3);
    expect(events[0].active).toBe(false);
    expect(events[0].source).toBe("vision");
    expect(md.active).toBe(false);
  });

  it("ignores a brief fist blip shorter than activateSeconds", () => {
    const md = new MuteDetector({ activateSeconds: 0.2, releaseSeconds: 0.25 });
    const events = [];
    for (let f = 0; f <= 2; f++) {
      const e = md.update(makeCandidate(MUTE_GESTURE), f * STEP);
      if (e) events.push(e);
    }
    for (let f = 3; f <= 15; f++) {
      const e = md.update(null, f * STEP);
      if (e) events.push(e);
    }
    expect(events).toHaveLength(0);
    expect(md.active).toBe(false);
  });

  it("keeps active when flicker during release window is shorter than releaseSeconds", () => {
    const md = new MuteDetector({ activateSeconds: 0.2, releaseSeconds: 0.25 });
    for (let f = 0; f <= 8; f++) md.update(makeCandidate(MUTE_GESTURE), f * STEP);
    expect(md.active).toBe(true);
    // non-fist frames 9,10
    md.update(null, 9 * STEP);
    md.update(null, 10 * STEP);
    // brief flicker back to fist frames 11,12
    md.update(makeCandidate(MUTE_GESTURE), 11 * STEP);
    md.update(makeCandidate(MUTE_GESTURE), 12 * STEP);
    // resume non-fist
    const events = [];
    for (let f = 13; f <= 22; f++) {
      const e = md.update(null, f * STEP);
      if (e) events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].active).toBe(false);
    // release timer restarted at frame 13; fire by frame 21
    expect(events[0].t).toBeCloseTo(21 * STEP, 3);
  });

  it("reset clears state and allows immediate re-activation", () => {
    const md = new MuteDetector({ activateSeconds: 0.2, releaseSeconds: 0.25 });
    for (let f = 0; f <= 6; f++) md.update(makeCandidate(MUTE_GESTURE), f * STEP);
    expect(md.active).toBe(true);
    md.reset();
    expect(md.active).toBe(false);
    const events = [];
    for (let f = 0; f <= 8; f++) {
      const e = md.update(makeCandidate(MUTE_GESTURE), f * STEP);
      if (e) events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].active).toBe(true);
  });
});

describe("ControlGestureRecognizer", () => {
  it("emits ready when both thumbs-up held for default holdSeconds", () => {
    const rec = new ControlGestureRecognizer();
    const events = [];
    for (let f = 0; f <= 40; f++) {
      const e = rec.update(
        makeCandidate("thumbs-up"),
        makeCandidate("thumbs-up"),
        f * STEP,
      );
      if (e) events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("control");
    expect(events[0].t).toBeCloseTo(1.2, 3);
    expect(events[0].action).toBe("ready");
    expect(events[0].source).toBe("vision");
  });

  it("does not repeat while continuing to hold", () => {
    const rec = new ControlGestureRecognizer();
    for (let f = 0; f <= 40; f++) {
      rec.update(makeCandidate("thumbs-up"), makeCandidate("thumbs-up"), f * STEP);
    }
    const more = [];
    for (let f = 41; f <= 90; f++) {
      const e = rec.update(
        makeCandidate("thumbs-up"),
        makeCandidate("thumbs-up"),
        f * STEP,
      );
      if (e) more.push(e);
    }
    expect(more).toHaveLength(0);
  });

  it("re-arms after releasing for >0.5s and fires again", () => {
    const rec = new ControlGestureRecognizer();
    // first hold 0..1.2s
    for (let f = 0; f <= 40; f++) {
      rec.update(makeCandidate("thumbs-up"), makeCandidate("thumbs-up"), f * STEP);
    }
    // release 0.6s (18 frames)
    for (let f = 41; f <= 58; f++) {
      rec.update(null, null, f * STEP);
    }
    // second hold
    const events = [];
    for (let f = 59; f <= 100; f++) {
      const e = rec.update(
        makeCandidate("thumbs-up"),
        makeCandidate("thumbs-up"),
        f * STEP,
      );
      if (e) events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("ready");
    expect(events[0].t).toBeCloseTo(59 * STEP + 1.2, 3);
  });

  it("toggles record-start then record-stop across two holds", () => {
    const rec = new ControlGestureRecognizer();
    const first = [];
    for (let f = 0; f <= 50; f++) {
      const e = rec.update(
        makeCandidate(OK_GESTURE),
        makeCandidate(OK_GESTURE),
        f * STEP,
      );
      if (e) first.push(e);
    }
    expect(first).toHaveLength(1);
    expect(first[0].action).toBe("record-start");

    // release 0.6s
    for (let f = 51; f <= 68; f++) {
      rec.update(null, null, f * STEP);
    }

    const second = [];
    for (let f = 69; f <= 120; f++) {
      const e = rec.update(
        makeCandidate(OK_GESTURE),
        makeCandidate(OK_GESTURE),
        f * STEP,
      );
      if (e) second.push(e);
    }
    expect(second).toHaveLength(1);
    expect(second[0].action).toBe("record-stop");
  });

  it("does nothing when only chord hand matches", () => {
    const rec = new ControlGestureRecognizer();
    const events = [];
    for (let f = 0; f <= 100; f++) {
      const e = rec.update(makeCandidate("thumbs-up"), null, f * STEP);
      if (e) events.push(e);
    }
    expect(events).toHaveLength(0);
  });

  it("does nothing when hands match different gestures", () => {
    const rec = new ControlGestureRecognizer();
    const events = [];
    for (let f = 0; f <= 100; f++) {
      const e = rec.update(
        makeCandidate("thumbs-up"),
        makeCandidate("fist"),
        f * STEP,
      );
      if (e) events.push(e);
    }
    expect(events).toHaveLength(0);
  });

  it("reports holdProgress while matching and null when idle", () => {
    const rec = new ControlGestureRecognizer();
    expect(rec.holdProgress).toBeNull();

    rec.update(makeCandidate("thumbs-up"), makeCandidate("thumbs-up"), 0);
    expect(rec.holdProgress).toEqual({ comboId: "ready", progress: 0 });

    rec.update(makeCandidate("thumbs-up"), makeCandidate("thumbs-up"), 0.6);
    expect(rec.holdProgress).toEqual({
      comboId: "ready",
      progress: expect.closeTo(0.5, 2),
    });

    rec.update(makeCandidate("thumbs-up"), makeCandidate("thumbs-up"), 1.2);
    expect(rec.holdProgress).toEqual({ comboId: "ready", progress: 1 });

    rec.update(null, null, 1.3);
    expect(rec.holdProgress).toBeNull();
  });

  it("resets timer when combo switches mid-hold", () => {
    const rec = new ControlGestureRecognizer();
    const events = [];
    // thumbs-up for 0.8s (not enough for ready)
    for (let f = 0; f <= 24; f++) {
      const e = rec.update(
        makeCandidate("thumbs-up"),
        makeCandidate("thumbs-up"),
        f * STEP,
      );
      if (e) events.push(e);
    }
    expect(events).toHaveLength(0);

    // switch to fist and hold long enough for pause (1.5s)
    for (let f = 25; f <= 80; f++) {
      const e = rec.update(
        makeCandidate("fist"),
        makeCandidate("fist"),
        f * STEP,
      );
      if (e) events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("pause");
    expect(events[0].t).toBeCloseTo(25 * STEP + 1.5, 3);
  });

  it("does not match when confidence is below 0.6", () => {
    const rec = new ControlGestureRecognizer();
    const events = [];
    for (let f = 0; f <= 100; f++) {
      const e = rec.update(
        makeCandidate("thumbs-up", 0.59),
        makeCandidate("thumbs-up", 0.9),
        f * STEP,
      );
      if (e) events.push(e);
    }
    expect(events).toHaveLength(0);
  });

  it("reset clears alternation and allows immediate re-fire", () => {
    const rec = new ControlGestureRecognizer();
    for (let f = 0; f <= 50; f++) {
      const e = rec.update(
        makeCandidate(OK_GESTURE),
        makeCandidate(OK_GESTURE),
        f * STEP,
      );
      if (e) expect(e.action).toBe("record-start");
    }
    rec.reset();
    const events = [];
    for (let f = 0; f <= 50; f++) {
      const e = rec.update(
        makeCandidate(OK_GESTURE),
        makeCandidate(OK_GESTURE),
        f * STEP,
      );
      if (e) events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("record-start");
  });
});
