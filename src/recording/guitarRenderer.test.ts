import { describe, expect, it } from "vitest";
import type { RecordedSession } from "../performance/session";
import type { SessionSettings } from "../performance/eventTypes";
import type { OfflineAudioContextLike } from "./types";
import { renderGuitarTrack } from "./guitarRenderer";
import { FakeAudioContext, FakeAudioBuffer, FakeGainNode } from "../test/fakeAudioContext";

const settings: SessionSettings = {
  handedness: "right",
  mode: "free",
  key: "C",
  bpm: 120,
  timeSignature: "4/4",
  instrumentPreset: "acoustic-steel",
  chordMappingMode: "scale",
};

function makeSession(events: RecordedSession["events"]): RecordedSession {
  return {
    version: "1.0.0",
    sessionId: "test-session-1",
    startedAt: new Date().toISOString(),
    settings,
    events,
  };
}

class FakeOfflineContext implements OfflineAudioContextLike {
  readonly sampleRate: number;
  readonly length: number;
  readonly destination = new FakeGainNode() as unknown as AudioNode;
  private readonly fakeCtx: FakeAudioContext;

  constructor(_channels: number, length: number, sampleRate: number) {
    this.sampleRate = sampleRate;
    this.length = length;
    this.fakeCtx = new FakeAudioContext(sampleRate);
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return this.fakeCtx.createBuffer(channels, length, sampleRate);
  }

  createBufferSource() {
    return this.fakeCtx.createBufferSource();
  }

  createGain() {
    return this.fakeCtx.createGain();
  }

  createBiquadFilter() {
    return this.fakeCtx.createBiquadFilter();
  }

  get currentTime() {
    return this.fakeCtx.currentTime;
  }

  async startRendering(): Promise<AudioBuffer> {
    const buf = new FakeAudioBuffer(1, this.length, this.sampleRate);
    return buf as unknown as AudioBuffer;
  }
}

describe("renderGuitarTrack", () => {
  it("renders a session and returns a Float32Array of expected length", async () => {
    const session = makeSession([
      { type: "chord", t: 0, chord: "C", confidence: 1, source: "test" },
      { type: "strum", t: 0.1, direction: "down", velocity: 1, intensity: 0.8, articulation: "normal", source: "test" },
      { type: "mute", t: 0.5, active: true, source: "test" },
    ]);

    const result = await renderGuitarTrack(session, {
      sampleRate: 8000,
      createOfflineContext: (ch, len, sr) => new FakeOfflineContext(ch, len, sr) as unknown as OfflineAudioContextLike,
    });

    expect(result.sampleRate).toBe(8000);
    expect(result.samples).toBeInstanceOf(Float32Array);
    expect(result.samples.length).toBe(28000);
  });

  it("uses options.durationSeconds when provided", async () => {
    const session = makeSession([
      { type: "chord", t: 0, chord: "C", confidence: 1, source: "test" },
    ]);

    const result = await renderGuitarTrack(session, {
      sampleRate: 8000,
      durationSeconds: 1.0,
      createOfflineContext: (ch, len, sr) => new FakeOfflineContext(ch, len, sr) as unknown as OfflineAudioContextLike,
    });

    expect(result.samples.length).toBe(8000);
  });

  it("enforces minimum duration of 0.5s", async () => {
    const session = makeSession([
      { type: "chord", t: 0, chord: "C", confidence: 1, source: "test" },
    ]);

    const result = await renderGuitarTrack(session, {
      sampleRate: 8000,
      durationSeconds: 0.1,
      createOfflineContext: (ch, len, sr) => new FakeOfflineContext(ch, len, sr) as unknown as OfflineAudioContextLike,
    });

    expect(result.samples.length).toBe(4000);
  });

  it("throws a descriptive error when OfflineAudioContext is missing and no factory is provided", async () => {
    const session = makeSession([
      { type: "chord", t: 0, chord: "C", confidence: 1, source: "test" },
    ]);

    const original = (globalThis as Record<string, unknown>).OfflineAudioContext;
    (globalThis as Record<string, unknown>).OfflineAudioContext = undefined;

    await expect(
      renderGuitarTrack(session, { sampleRate: 8000 }),
    ).rejects.toThrow("OfflineAudioContext");

    (globalThis as Record<string, unknown>).OfflineAudioContext = original;
  });
});
