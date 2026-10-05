import type { RecordedSession } from "../performance/session";

/** Mono PCM track captured from the microphone. */
export interface VocalCapture {
  /** Interleaved-free mono samples, normalized -1..1. */
  samples: Float32Array;
  sampleRate: number;
  /** Capture start offset in session seconds (≈0; latency uncompensated). */
  startOffsetSeconds: number;
}

/** One logical export artifact. */
export interface ExportArtifact {
  kind: "vocal-wav" | "guitar-wav" | "mix-wav" | "performance-json";
  filename: string;
  blob: Blob;
}

/** A single export path failure (other paths still proceed — RECORDING_EXPORT §7). */
export interface ExportFailure {
  kind: ExportArtifact["kind"];
  message: string;
}

export interface ExportResult {
  artifacts: ExportArtifact[];
  failures: ExportFailure[];
  /** The session the export was built from (never discarded, even on total failure). */
  session: RecordedSession;
}

export interface GuitarRenderOptions {
  sampleRate: number;
  /** Render length; defaults to last event time + trailing decay. */
  durationSeconds?: number;
  /** Injectable for tests; defaults to OfflineAudioContext in browsers. */
  createOfflineContext?: (
    channels: number,
    length: number,
    sampleRate: number,
  ) => OfflineAudioContextLike;
}

/** Narrow OfflineAudioContext shape the guitar renderer relies on. */
export interface OfflineAudioContextLike {
  readonly sampleRate: number;
  readonly destination: AudioNode;
  startRendering(): Promise<AudioBuffer>;
}
