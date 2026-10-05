// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyboardSimulator } from "../debug/keyboardSimulator";
import { DEFAULT_SETTINGS } from "../storage/settingsStore";
import { FakeAudioContext } from "../test/fakeAudioContext";
import { PerformanceController } from "./performanceController";

function dispatchKey(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, ...init }));
}

function makeController() {
  const fakeCtx = new FakeAudioContext();
  vi.stubGlobal("AudioContext", vi.fn(() => fakeCtx));
  const controller = new PerformanceController();
  return { fakeCtx, controller };
}

describe("PerformanceController keyboard path (acceptance B)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keyboard chord + strum drives the guitar engine end to end", async () => {
    const { fakeCtx, controller } = makeController();
    await controller.startAudio({ ...DEFAULT_SETTINGS, key: "C" });
    const sim = new KeyboardSimulator(controller.bus, {
      resolveSlot: (slot) => controller.resolveSlot(slot),
    });
    sim.attach(window);

    // Set C (slot-1 in C major), strum down.
    dispatchKey({ code: "Digit1" });
    expect(controller.store.getSnapshot().chord).toBe("C");
    dispatchKey({ code: "ArrowDown" });
    expect(fakeCtx.createdSources.length).toBe(5); // C = 5 sounding strings
    expect(controller.store.getSnapshot().lastStrum?.direction).toBe("down");

    // Switch to G (slot-5), strum up.
    dispatchKey({ code: "Digit5" });
    expect(controller.store.getSnapshot().chord).toBe("G");
    dispatchKey({ code: "ArrowUp" });
    expect(fakeCtx.createdSources.length).toBe(5 + 6); // G = 6 strings
    expect(controller.store.getSnapshot().lastStrum?.direction).toBe("up");

    // Mute, then strum — damped articulation.
    dispatchKey({ code: "Space" });
    expect(controller.store.getSnapshot().muteActive).toBe(true);
    const buffersBefore = fakeCtx.createdBuffers.length;
    dispatchKey({ code: "ArrowDown" });
    const newBuffers = fakeCtx.createdBuffers.slice(buffersBefore);
    expect(Math.max(...newBuffers.map((b) => b.length))).toBeLessThan(fakeCtx.sampleRate * 0.5);

    // Intensity difference is audible via voice gain.
    const soft = controller.store.getSnapshot();
    dispatchKey({ code: "Space" }); // unmute
    dispatchKey({ code: "ArrowDown", shiftKey: true });
    expect(controller.store.getSnapshot().lastStrum?.intensity).toBe(0.9);
    expect(soft).not.toBe(controller.store.getSnapshot());

    sim.detach();
    controller.dispose();
  });

  it("KeyR records a session containing the performed events", async () => {
    const fakeCtx = new FakeAudioContext();
    vi.stubGlobal("AudioContext", vi.fn(() => fakeCtx));
    let recorded: import("../performance/session").RecordedSession | null = null;
    const controller = new PerformanceController({
      onSessionRecorded: (s) => {
        recorded = s;
      },
    });
    await controller.startAudio({ ...DEFAULT_SETTINGS });
    const sim = new KeyboardSimulator(controller.bus, {
      resolveSlot: (slot) => controller.resolveSlot(slot),
    });
    sim.attach(window);

    dispatchKey({ code: "KeyR" }); // record-start
    expect(controller.store.getSnapshot().recording).toBe(true);
    dispatchKey({ code: "Digit1" });
    dispatchKey({ code: "ArrowDown" });
    dispatchKey({ code: "KeyR" }); // record-stop
    // record-stop handling is deferred one microtask so the event is logged.
    await new Promise((r) => setTimeout(r, 0));
    expect(controller.store.getSnapshot().recording).toBe(false);

    expect(recorded).not.toBeNull();
    const session = recorded as unknown as import("../performance/session").RecordedSession;
    // record-start precedes the recording origin (excluded by design);
    // record-stop is captured before the recorder unsubscribes.
    expect(session.events.map((e) => e.type)).toEqual(["chord", "strum", "control"]);
    expect(session.events.every((e) => e.t >= 0)).toBe(true);
    expect(session.settings.bpm).toBe(DEFAULT_SETTINGS.bpm);

    sim.detach();
    controller.dispose();
  });

  it("metronome start/stop toggles transport state", async () => {
    const { controller } = makeController();
    await controller.startAudio({ ...DEFAULT_SETTINGS });
    controller.startMetronome();
    expect(controller.store.getSnapshot().metronomeRunning).toBe(true);
    controller.stopMetronome();
    expect(controller.store.getSnapshot().metronomeRunning).toBe(false);
    controller.dispose();
  });

  it("custom chord mapping resolves slots", async () => {
    const { controller } = makeController();
    await controller.startAudio({
      ...DEFAULT_SETTINGS,
      chordMappingMode: "custom",
      customMapping: { "slot-1": "Bb", "slot-3": "F#m" },
    });
    expect(controller.resolveSlot("slot-1")).toBe("A#"); // normalized
    expect(controller.resolveSlot("slot-3")).toBe("F#m");
    expect(controller.resolveSlot("slot-6")).toBeNull();
    controller.dispose();
  });

  it("scale mode mapping follows the key (acceptance D)", async () => {
    const { controller } = makeController();
    await controller.startAudio({ ...DEFAULT_SETTINGS, key: "G" });
    expect(controller.resolveSlot("slot-1")).toBe("G");
    expect(controller.resolveSlot("slot-6")).toBe("Em");
    controller.updateSettings({ ...DEFAULT_SETTINGS, key: "D" });
    expect(controller.resolveSlot("slot-1")).toBe("D");
    expect(controller.resolveSlot("slot-2")).toBe("Em");
    controller.dispose();
  });
});
