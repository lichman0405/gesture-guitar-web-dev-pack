import { describe, expect, it, vi } from "vitest";
import { EventBus } from "./eventBus";
import { SessionRecorder } from "./session";
import type { SessionSettings, StrumEvent } from "./eventTypes";

const settings: SessionSettings = {
  handedness: "right",
  mode: "free",
  key: "C",
  bpm: 120,
  timeSignature: "4/4",
  instrumentPreset: "acoustic-steel",
  chordMappingMode: "scale",
};

function makeStrum(t: number): StrumEvent {
  return {
    type: "strum",
    t,
    direction: "down",
    velocity: 1,
    intensity: 0.5,
    articulation: "normal",
    source: "test",
  };
}

describe("EventBus", () => {
  it("dispatches events synchronously to all listeners", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    bus.publish(makeStrum(1));
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(a.mock.calls[0][0].type).toBe("strum");
  });

  it("unsubscribe stops delivery", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const off = bus.subscribe(a);
    off();
    bus.publish(makeStrum(1));
    expect(a).not.toHaveBeenCalled();
  });

  it("clock is monotonic seconds", () => {
    const bus = new EventBus();
    const t1 = bus.now();
    const t2 = bus.now();
    expect(t2).toBeGreaterThanOrEqual(t1);
    expect(t1).toBeLessThan(10);
  });
});

describe("SessionRecorder", () => {
  it("records events with t re-based to record start", () => {
    const bus = new EventBus();
    const recorder = new SessionRecorder(bus);
    recorder.start(settings, "test-session");
    bus.publish(makeStrum(bus.now()));
    bus.publish(makeStrum(bus.now()));
    const session = recorder.stop();
    expect(session).not.toBeNull();
    expect(session!.sessionId).toBe("test-session");
    expect(session!.events).toHaveLength(2);
    for (const e of session!.events) {
      expect(e.t).toBeGreaterThanOrEqual(0);
      expect(e.t).toBeLessThan(5);
    }
    expect(session!.settings.bpm).toBe(120);
    expect(recorder.isRecording).toBe(false);
  });

  it("ignores events outside recording window", () => {
    const bus = new EventBus();
    const recorder = new SessionRecorder(bus);
    bus.publish(makeStrum(0));
    recorder.start(settings);
    bus.publish(makeStrum(bus.now()));
    const session = recorder.stop();
    expect(session!.events).toHaveLength(1);
    expect(recorder.stop()).toBeNull();
  });
});
