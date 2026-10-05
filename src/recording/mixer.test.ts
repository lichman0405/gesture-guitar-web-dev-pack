import { describe, expect, it } from "vitest";
import { mixPcmTracks, resampleLinear } from "./mixer";

describe("mixPcmTracks", () => {
  it("sums tracks with default gain 1", () => {
    const a = new Float32Array([0.25, 0.5, 0.25]);
    const b = new Float32Array([0.25, 0.25, 0.5]);
    const result = mixPcmTracks([{ samples: a }, { samples: b }]);
    expect(result).toEqual(new Float32Array([0.5, 0.75, 0.75]));
  });

  it("applies per-track gain", () => {
    const a = new Float32Array([1, 1]);
    const b = new Float32Array([1, 1]);
    const result = mixPcmTracks([{ samples: a, gain: 0.5 }, { samples: b, gain: 0.5 }]);
    expect(result).toEqual(new Float32Array([1, 1]));
  });

  it("pads shorter tracks with zeros", () => {
    const a = new Float32Array([0.25, 0.5, 0.75, 1.0]);
    const b = new Float32Array([0.25, 0.25]);
    const result = mixPcmTracks([{ samples: a }, { samples: b }]);
    expect(result).toEqual(new Float32Array([0.5, 0.75, 0.75, 1.0]));
  });

  it("normalizes when peak exceeds 1", () => {
    const a = new Float32Array([0.6, 0.6]);
    const b = new Float32Array([0.6, 0.6]);
    const result = mixPcmTracks([{ samples: a }, { samples: b }]);
    // peak = 1.2, scale = 0.98 / 1.2
    expect(Math.max(...Array.from(result))).toBeCloseTo(0.98, 5);
  });

  it("does not normalize when peak is within 1", () => {
    const a = new Float32Array([0.3, 0.3]);
    const b = new Float32Array([0.3, 0.3]);
    const result = mixPcmTracks([{ samples: a }, { samples: b }]);
    expect(result).toEqual(new Float32Array([0.6, 0.6]));
  });
});

describe("resampleLinear", () => {
  it("returns a copy when rates are equal", () => {
    const samples = new Float32Array([1, 2, 3]);
    const result = resampleLinear(samples, 44100, 44100);
    expect(result).toEqual(samples);
    expect(result).not.toBe(samples);
  });

  it("upsamples 2:1", () => {
    const samples = new Float32Array([0, 1]);
    const result = resampleLinear(samples, 1, 2);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0.5);
    expect(result[2]).toBe(1);
    expect(result[3]).toBe(1);
  });

  it("downsamples 1:2", () => {
    const samples = new Float32Array([0, 0.5, 1, 1.5]);
    const result = resampleLinear(samples, 2, 1);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(1);
  });
});
