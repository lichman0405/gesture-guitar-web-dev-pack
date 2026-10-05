import { describe, expect, it } from "vitest";
import type { RecordedSession } from "../performance/session";
import type { SessionSettings } from "../performance/eventTypes";
import type { VocalCapture } from "./types";
import { exportSession } from "./sessionExporter";

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

describe("exportSession", () => {
  it("produces 4 artifacts with correct filenames and kinds", async () => {
    const session = makeSession([
      { type: "chord", t: 0, chord: "C", confidence: 1, source: "test" },
      { type: "strum", t: 0.1, direction: "down", velocity: 1, intensity: 0.8, articulation: "normal", source: "test" },
    ]);

    const vocal: VocalCapture = {
      samples: new Float32Array(8000).fill(0.1),
      sampleRate: 8000,
      startOffsetSeconds: 0,
    };

    const result = await exportSession(session, {
      vocal,
      guitarSampleRate: 16000,
      renderGuitar: async () => ({
        samples: new Float32Array(16000).fill(0.05),
        sampleRate: 16000,
      }),
    });

    expect(result.artifacts).toHaveLength(4);
    const kinds = result.artifacts.map((a) => a.kind);
    expect(kinds).toContain("performance-json");
    expect(kinds).toContain("vocal-wav");
    expect(kinds).toContain("guitar-wav");
    expect(kinds).toContain("mix-wav");

    const perf = result.artifacts.find((a) => a.kind === "performance-json")!;
    expect(perf.filename).toBe("test-session-1.performance.json");

    const vocalWav = result.artifacts.find((a) => a.kind === "vocal-wav")!;
    expect(vocalWav.filename).toBe("test-session-1.vocal.wav");

    const guitarWav = result.artifacts.find((a) => a.kind === "guitar-wav")!;
    expect(guitarWav.filename).toBe("test-session-1.guitar.wav");

    const mixWav = result.artifacts.find((a) => a.kind === "mix-wav")!;
    expect(mixWav.filename).toBe("test-session-1.mix.wav");
  });

  it("performance.json parses and contains required fields", async () => {
    const session = makeSession([
      { type: "chord", t: 0, chord: "C", confidence: 1, source: "test" },
    ]);

    const result = await exportSession(session, {
      vocal: { samples: new Float32Array(8000).fill(0.1), sampleRate: 8000, startOffsetSeconds: 0 },
      guitarSampleRate: 16000,
      renderGuitar: async () => ({
        samples: new Float32Array(16000).fill(0.05),
        sampleRate: 16000,
      }),
    });

    const perf = result.artifacts.find((a) => a.kind === "performance-json")!;
    const text = await perf.blob.text();
    const json = JSON.parse(text);
    expect(json.version).toBe("1.0.0");
    expect(json.sessionId).toBe("test-session-1");
    expect(Array.isArray(json.events)).toBe(true);
    expect(json.settings.instrumentPreset).toBe("acoustic-steel");
  });

  it("isolates guitar render failure and still produces other artifacts", async () => {
    const session = makeSession([
      { type: "chord", t: 0, chord: "C", confidence: 1, source: "test" },
    ]);

    const result = await exportSession(session, {
      vocal: { samples: new Float32Array(8000).fill(0.1), sampleRate: 8000, startOffsetSeconds: 0 },
      guitarSampleRate: 16000,
      renderGuitar: async () => {
        throw new Error("guitar render failed");
      },
    });

    const kinds = result.artifacts.map((a) => a.kind);
    expect(kinds).toContain("performance-json");
    expect(kinds).toContain("vocal-wav");
    expect(kinds).toContain("mix-wav");
    expect(kinds).not.toContain("guitar-wav");

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].kind).toBe("guitar-wav");
    expect(result.failures[0].message).toContain("guitar render failed");
  });

  it("produces mix even when vocal is absent", async () => {
    const session = makeSession([
      { type: "chord", t: 0, chord: "C", confidence: 1, source: "test" },
    ]);

    const result = await exportSession(session, {
      guitarSampleRate: 16000,
      renderGuitar: async () => ({
        samples: new Float32Array(16000).fill(0.05),
        sampleRate: 16000,
      }),
    });

    const kinds = result.artifacts.map((a) => a.kind);
    expect(kinds).toContain("performance-json");
    expect(kinds).toContain("guitar-wav");
    expect(kinds).toContain("mix-wav");
    expect(kinds).not.toContain("vocal-wav");
  });
});
