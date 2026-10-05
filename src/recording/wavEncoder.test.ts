import { describe, expect, it } from "vitest";
import { encodeWavPcm16 } from "./wavEncoder";

describe("encodeWavPcm16", () => {
  it("writes RIFF and WAVE magic", async () => {
    const samples = new Float32Array([0, 0.5, -0.5]);
    const blob = encodeWavPcm16(samples, 44100);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(riff).toBe("RIFF");
    expect(wave).toBe("WAVE");
  });

  it("has correct total byte length", async () => {
    const samples = new Float32Array(100);
    const blob = encodeWavPcm16(samples, 48000);
    const buffer = await blob.arrayBuffer();
    expect(buffer.byteLength).toBe(44 + 2 * 100);
  });

  it("declares mono 16-bit PCM format fields", async () => {
    const samples = new Float32Array([0]);
    const blob = encodeWavPcm16(samples, 22050);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint16(34, true)).toBe(16); // 16-bit
  });

  it("round-trips and clips sample values", async () => {
    const samples = new Float32Array([0.5, -1, 1, 1.5, -1.2]);
    const blob = encodeWavPcm16(samples, 44100);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const off = 44;
    expect(view.getInt16(off + 0, true)).toBeCloseTo(16384, -1);
    expect(view.getInt16(off + 2, true)).toBe(-32768);
    expect(view.getInt16(off + 4, true)).toBe(32767);
    expect(view.getInt16(off + 6, true)).toBe(32767);
    expect(view.getInt16(off + 8, true)).toBe(-32768);
  });
});
