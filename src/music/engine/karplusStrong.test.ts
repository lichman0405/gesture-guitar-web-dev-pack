import { describe, expect, it } from "vitest";
import {
  estimateFundamental,
  renderKarplusStrongPluck,
  rmsEnergy,
} from "./karplusStrong";

const SR = 44100;

describe("renderKarplusStrongPluck", () => {
  it("produces a buffer of the requested length", () => {
    const buf = renderKarplusStrongPluck({
      frequency: 110,
      sampleRate: SR,
      durationSeconds: 1,
      decaySeconds: 2,
      brightness: 0.7,
      intensity: 0.8,
    });
    expect(buf.length).toBe(SR);
  });

  it("peak stays within intensity bounds", () => {
    const buf = renderKarplusStrongPluck({
      frequency: 196,
      sampleRate: SR,
      durationSeconds: 0.5,
      decaySeconds: 2,
      brightness: 0.7,
      intensity: 0.5,
    });
    let peak = 0;
    for (const s of buf) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeLessThanOrEqual(0.5 + 1e-3);
    expect(peak).toBeGreaterThan(0.2);
  });

  it("renders approximately the requested fundamental (A2 = 110 Hz)", () => {
    const buf = renderKarplusStrongPluck({
      frequency: 110,
      sampleRate: SR,
      durationSeconds: 1,
      decaySeconds: 3,
      brightness: 0.7,
      intensity: 0.8,
    });
    const estimate = estimateFundamental(buf, SR);
    expect(Math.abs(estimate - 110) / 110).toBeLessThan(0.03);
  });

  it("renders high E string (329.6 Hz) within tolerance", () => {
    const buf = renderKarplusStrongPluck({
      frequency: 329.63,
      sampleRate: SR,
      durationSeconds: 1,
      decaySeconds: 3,
      brightness: 0.7,
      intensity: 0.8,
    });
    const estimate = estimateFundamental(buf, SR);
    expect(Math.abs(estimate - 329.63) / 329.63).toBeLessThan(0.03);
  });

  it("energy decays over time", () => {
    const buf = renderKarplusStrongPluck({
      frequency: 110,
      sampleRate: SR,
      durationSeconds: 2,
      decaySeconds: 1,
      brightness: 0.7,
      intensity: 0.8,
    });
    const early = rmsEnergy(buf, 0, SR / 4);
    const late = rmsEnergy(buf, SR, SR * 2);
    expect(late).toBeLessThan(early * 0.4);
  });

  it("muted articulation decays much faster than normal", () => {
    const base = {
      frequency: 110,
      sampleRate: SR,
      durationSeconds: 1,
      decaySeconds: 3,
      brightness: 0.7,
      intensity: 0.8,
    };
    const normal = renderKarplusStrongPluck(base);
    const muted = renderKarplusStrongPluck({ ...base, muted: true });
    const tail = SR / 2;
    const normalTail = rmsEnergy(normal, tail);
    const mutedTail = rmsEnergy(muted, tail);
    expect(mutedTail).toBeLessThan(normalTail * 0.1);
  });

  it("is deterministic for the same seed", () => {
    const opts = {
      frequency: 146.83,
      sampleRate: SR,
      durationSeconds: 0.25,
      decaySeconds: 2,
      brightness: 0.6,
      intensity: 0.7,
      seed: 42,
    };
    const a = renderKarplusStrongPluck(opts);
    const b = renderKarplusStrongPluck(opts);
    expect(Array.from(a.slice(0, 500))).toEqual(Array.from(b.slice(0, 500)));
  });

  it("rejects invalid frequency", () => {
    expect(() =>
      renderKarplusStrongPluck({
        frequency: 0,
        sampleRate: SR,
        durationSeconds: 1,
        decaySeconds: 1,
        brightness: 0.5,
        intensity: 0.5,
      }),
    ).toThrow();
  });
});
