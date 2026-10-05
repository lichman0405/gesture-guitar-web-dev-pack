import { describe, expect, it } from "vitest";
import type { StrumEvent } from "../../performance/eventTypes";
import { FakeAudioContext } from "../../test/fakeAudioContext";
import { ProceduralGuitarEngine } from "./ProceduralGuitarEngine";

function makeStrum(overrides: Partial<StrumEvent> = {}): StrumEvent {
  return {
    type: "strum",
    t: 0,
    direction: "down",
    velocity: 1,
    intensity: 0.6,
    articulation: "normal",
    source: "test",
    ...overrides,
  };
}

function makeEngine() {
  const ctx = new FakeAudioContext();
  // Cast: the fake structurally provides everything the engine uses.
  const engine = new ProceduralGuitarEngine(ctx as never, { seedBase: 7 });
  return { ctx, engine };
}

describe("ProceduralGuitarEngine", () => {
  it("prepare() pre-renders buffers for the current chord", async () => {
    const { ctx, engine } = makeEngine();
    await engine.prepare();
    expect(engine.isPrepared).toBe(true);
    // C major = 5 sounding strings.
    expect(ctx.createdBuffers.length).toBeGreaterThanOrEqual(5);
  });

  it("down strum schedules sounding strings low->high with increasing start times", () => {
    const { ctx, engine } = makeEngine();
    engine.setChord("C"); // 5 sounding strings (low E muted)
    engine.strum(makeStrum({ direction: "down", intensity: 0.6 }));
    expect(ctx.createdSources).toHaveLength(5);
    const starts = ctx.createdSources.map((s) => s.startedAt!);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]).toBeGreaterThan(starts[i - 1]);
    }
    // First string starts within a few ms of now; whole strum well under 100 ms.
    expect(starts[0]).toBeLessThan(0.02);
    expect(starts[starts.length - 1] - starts[0]).toBeLessThan(0.1);
  });

  it("up strum schedules strings high->low", () => {
    const { ctx, engine } = makeEngine();
    engine.setChord("G"); // 6 sounding strings
    engine.strum(makeStrum({ direction: "up", intensity: 0.6 }));
    expect(ctx.createdSources).toHaveLength(6);
    const starts = ctx.createdSources.map((s) => s.startedAt!);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]).toBeGreaterThan(starts[i - 1]);
    }
  });

  it("accent (high intensity) produces tighter spacing than soft", () => {
    const a = makeEngine();
    a.engine.setChord("G");
    a.engine.strum(makeStrum({ intensity: 0.95 }));
    const spanA = lastSpan(a.ctx);

    const b = makeEngine();
    b.engine.setChord("G");
    b.engine.strum(makeStrum({ intensity: 0.2 }));
    const spanB = lastSpan(b.ctx);

    expect(spanA).toBeLessThan(spanB);
  });

  it("accent produces higher per-string gain than soft", () => {
    const loud = makeEngine();
    loud.engine.setChord("C");
    loud.engine.strum(makeStrum({ intensity: 0.95 }));
    // gains[0] is the engine output node; voice gains come after.
    const loudGain = Math.max(...loud.ctx.createdGains.slice(1).map((g) => g.gain.value));

    const soft = makeEngine();
    soft.engine.setChord("C");
    soft.engine.strum(makeStrum({ intensity: 0.2 }));
    const softGain = Math.max(...soft.ctx.createdGains.slice(1).map((g) => g.gain.value));

    expect(loudGain).toBeGreaterThan(softGain * 2);
  });

  it("muted articulation uses shorter, darker buffers", () => {
    const { ctx, engine } = makeEngine();
    engine.setChord("C");
    engine.strum(makeStrum({ articulation: "muted" }));
    const maxLen = Math.max(...ctx.createdBuffers.map((b) => b.length));
    expect(maxLen).toBeLessThan(ctx.sampleRate * 0.5);
  });

  it("setMuted(true) damps active voices and subsequent strums are muted", () => {
    const { ctx, engine } = makeEngine();
    engine.setChord("G");
    engine.strum(makeStrum({ intensity: 0.8 }));
    engine.setMuted(true);
    // Damp: some gain param received a setTargetAtTime toward 0.
    const damped = ctx.createdGains.some((g) =>
      g.gain.calls.some((c) => c.method === "setTargetAtTime" && c.value === 0),
    );
    expect(damped).toBe(true);

    const buffersBefore = ctx.createdBuffers.length;
    engine.strum(makeStrum({ articulation: "normal", intensity: 0.8 }));
    const newBuffers = ctx.createdBuffers.slice(buffersBefore);
    expect(newBuffers.length).toBeGreaterThan(0);
    expect(Math.max(...newBuffers.map((b) => b.length))).toBeLessThan(ctx.sampleRate * 0.5);
  });

  it("retriggering a string chokes the previous voice on that string", () => {
    const { ctx, engine } = makeEngine();
    engine.setChord("C");
    engine.strum(makeStrum());
    ctx.advanceTime(0.2);
    engine.strum(makeStrum());
    // First strum's sources must have been stopped (choked) explicitly.
    const firstStrumSources = ctx.createdSources.slice(0, 5);
    expect(firstStrumSources.every((s) => s.stoppedAt !== null)).toBe(true);
  });

  it("stopAll stops every voice", () => {
    const { ctx, engine } = makeEngine();
    engine.setChord("G");
    engine.strum(makeStrum());
    engine.stopAll();
    expect(ctx.createdSources.every((s) => s.stoppedAt !== null)).toBe(true);
  });

  it("chord change alters which strings sound (Em uses all 6)", () => {
    const { ctx, engine } = makeEngine();
    engine.setChord("Em");
    engine.strum(makeStrum());
    expect(ctx.createdSources).toHaveLength(6);
  });

  it("preset switch changes rendered buffers", async () => {
    const { ctx, engine } = makeEngine();
    engine.setChord("C");
    await engine.prepare();
    const steelBuffers = ctx.createdBuffers.length;
    engine.setPreset("nylon");
    engine.setChord("C");
    engine.strum(makeStrum());
    expect(ctx.createdBuffers.length).toBeGreaterThan(steelBuffers);
    expect(engine.presetId).toBe("nylon");
  });

  it("scheduleStrum honors absolute times for offline rendering", () => {
    const { ctx, engine } = makeEngine();
    engine.setChord("C");
    engine.scheduleStrum(makeStrum(), 2.5);
    expect(ctx.createdSources[0].startedAt).toBeCloseTo(2.5, 5);
  });

  it("connects its output to a destination node", () => {
    const { ctx, engine } = makeEngine();
    const destination = ctx.createGain();
    engine.connect(destination as never);
    // Output gain node of engine should have recorded the connection.
    const output = ctx.createdGains[0];
    expect(output.connections).toContain(destination);
  });
});

function lastSpan(ctx: FakeAudioContext): number {
  const starts = ctx.createdSources.map((s) => s.startedAt!);
  return starts[starts.length - 1] - starts[0];
}
