// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EventBus } from "../performance/eventBus";
import { KeyboardSimulator } from "./keyboardSimulator";
import type {
  ChordEvent,
  ControlEvent,
  MuteEvent,
  PerformanceEvent,
  StrumEvent,
} from "../performance/eventTypes";

function makeSimulator(bus: EventBus): KeyboardSimulator {
  return new KeyboardSimulator(bus, {
    resolveSlot: (slotId: string): string | null => {
      const map: Record<string, string> = {
        "slot-1": "C",
        "slot-2": "D",
        "slot-3": "E",
        "slot-4": "F",
        "slot-5": "G",
        "slot-6": "A",
      };
      return map[slotId] ?? null;
    },
  });
}

function dispatchKey(options: {
  code: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  repeat?: boolean;
  cancelable?: boolean;
}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    code: options.code,
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    repeat: options.repeat ?? false,
    bubbles: true,
    cancelable: options.cancelable ?? true,
  });
  window.dispatchEvent(event);
  return event;
}

describe("KeyboardSimulator", () => {
  it("Digit1 emits chord C with slot slot-1", () => {
    const bus = new EventBus();
    const sim = makeSimulator(bus);
    const events: PerformanceEvent[] = [];
    bus.subscribe((e) => events.push(e));
    sim.attach(window);
    dispatchKey({ code: "Digit1" });
    expect(events).toHaveLength(1);
    const ev = events[0] as ChordEvent;
    expect(ev.type).toBe("chord");
    expect(ev.slot).toBe("slot-1");
    expect(ev.chord).toBe("C");
    expect(ev.confidence).toBe(1);
    expect(ev.source).toBe("keyboard");
    sim.detach();
  });

  it("unresolved slot emits nothing", () => {
    const bus = new EventBus();
    const sim = new KeyboardSimulator(bus, {
      resolveSlot: () => null,
    });
    const events: PerformanceEvent[] = [];
    bus.subscribe((e) => events.push(e));
    sim.attach(window);
    dispatchKey({ code: "Digit1" });
    expect(events).toHaveLength(0);
    sim.detach();
  });

  it("explicit chords: KeyA emits A, Shift+KeyA emits Am", () => {
    const bus = new EventBus();
    const sim = new KeyboardSimulator(bus);
    const events: PerformanceEvent[] = [];
    bus.subscribe((e) => events.push(e));
    sim.attach(window);
    dispatchKey({ code: "KeyA" });
    expect(events).toHaveLength(1);
    expect((events[0] as ChordEvent).chord).toBe("A");
    dispatchKey({ code: "KeyA", shiftKey: true });
    expect(events).toHaveLength(2);
    expect((events[1] as ChordEvent).chord).toBe("Am");
    sim.detach();
  });

  it("strum arrows with default, accent and soft dynamics", () => {
    const bus = new EventBus();
    const sim = new KeyboardSimulator(bus);
    const events: PerformanceEvent[] = [];
    bus.subscribe((e) => events.push(e));
    sim.attach(window);

    dispatchKey({ code: "ArrowDown" });
    expect(events).toHaveLength(1);
    let ev = events[0] as StrumEvent;
    expect(ev.direction).toBe("down");
    expect(ev.velocity).toBe(1.0);
    expect(ev.intensity).toBe(0.55);
    expect(ev.articulation).toBe("normal");

    dispatchKey({ code: "ArrowUp", shiftKey: true });
    expect(events).toHaveLength(2);
    ev = events[1] as StrumEvent;
    expect(ev.direction).toBe("up");
    expect(ev.velocity).toBe(1.6);
    expect(ev.intensity).toBe(0.9);
    expect(ev.articulation).toBe("normal");

    dispatchKey({ code: "ArrowDown", ctrlKey: true });
    expect(events).toHaveLength(3);
    ev = events[2] as StrumEvent;
    expect(ev.direction).toBe("down");
    expect(ev.velocity).toBe(0.5);
    expect(ev.intensity).toBe(0.25);
    expect(ev.articulation).toBe("normal");

    sim.detach();
  });

  it("space toggles mute and affects strum articulation", () => {
    const bus = new EventBus();
    const sim = new KeyboardSimulator(bus);
    const events: PerformanceEvent[] = [];
    bus.subscribe((e) => events.push(e));
    sim.attach(window);

    dispatchKey({ code: "Space" });
    expect(events).toHaveLength(1);
    let ev = events[0] as MuteEvent;
    expect(ev.type).toBe("mute");
    expect(ev.active).toBe(true);
    expect(sim.muteActive).toBe(true);

    dispatchKey({ code: "ArrowDown" });
    expect(events).toHaveLength(2);
    const strumEv = events[1] as StrumEvent;
    expect(strumEv.articulation).toBe("muted");

    dispatchKey({ code: "Space" });
    expect(events).toHaveLength(3);
    ev = events[2] as MuteEvent;
    expect(ev.active).toBe(false);
    expect(sim.muteActive).toBe(false);

    sim.detach();
  });

  it("KeyR toggles recording, KeyP toggles pause, Escape emits stop", () => {
    const bus = new EventBus();
    const sim = new KeyboardSimulator(bus);
    const events: PerformanceEvent[] = [];
    bus.subscribe((e) => events.push(e));
    sim.attach(window);

    dispatchKey({ code: "KeyR" });
    expect(events).toHaveLength(1);
    let ev = events[0] as ControlEvent;
    expect(ev.action).toBe("record-start");
    expect(sim.isRecording).toBe(true);

    dispatchKey({ code: "KeyR" });
    expect(events).toHaveLength(2);
    ev = events[1] as ControlEvent;
    expect(ev.action).toBe("record-stop");
    expect(sim.isRecording).toBe(false);

    dispatchKey({ code: "KeyP" });
    expect(events).toHaveLength(3);
    ev = events[2] as ControlEvent;
    expect(ev.action).toBe("pause");
    expect(sim.isPaused).toBe(true);

    dispatchKey({ code: "KeyP" });
    expect(events).toHaveLength(4);
    ev = events[3] as ControlEvent;
    expect(ev.action).toBe("resume");
    expect(sim.isPaused).toBe(false);

    dispatchKey({ code: "Escape" });
    expect(events).toHaveLength(5);
    ev = events[4] as ControlEvent;
    expect(ev.action).toBe("stop");

    sim.detach();
  });

  it("ignores repeated keydown events", () => {
    const bus = new EventBus();
    const sim = new KeyboardSimulator(bus);
    const events: PerformanceEvent[] = [];
    bus.subscribe((e) => events.push(e));
    sim.attach(window);
    dispatchKey({ code: "Digit1", repeat: true });
    dispatchKey({ code: "Space", repeat: true });
    dispatchKey({ code: "ArrowDown", repeat: true });
    expect(events).toHaveLength(0);
    sim.detach();
  });

  it("detach stops event emission", () => {
    const bus = new EventBus();
    const sim = new KeyboardSimulator(bus);
    const events: PerformanceEvent[] = [];
    bus.subscribe((e) => events.push(e));
    sim.attach(window);
    sim.detach();
    dispatchKey({ code: "Space" });
    expect(events).toHaveLength(0);
    expect(sim.isAttached).toBe(false);
  });

  it("calls preventDefault for handled keys", () => {
    const bus = new EventBus();
    const sim = makeSimulator(bus);
    sim.attach(window);
    const ev1 = dispatchKey({ code: "ArrowDown" });
    expect(ev1.defaultPrevented).toBe(true);
    const ev2 = dispatchKey({ code: "Space" });
    expect(ev2.defaultPrevented).toBe(true);
    const ev3 = dispatchKey({ code: "Digit1" });
    expect(ev3.defaultPrevented).toBe(true);
    sim.detach();
  });

  it("ignores keydown on input targets", () => {
    const bus = new EventBus();
    const sim = new KeyboardSimulator(bus);
    const events: PerformanceEvent[] = [];
    bus.subscribe((e) => events.push(e));
    sim.attach(window);
    const input = document.createElement("input");
    document.body.appendChild(input);
    const ev = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(ev);
    expect(events).toHaveLength(0);
    sim.detach();
    document.body.removeChild(input);
  });
});
