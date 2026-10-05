import type { RecordedSession } from "../performance/session";
import type { VocalCapture, ExportResult, GuitarRenderOptions, ExportArtifact, ExportFailure } from "./types";
import { sessionToPerformanceJson, performanceJsonBlob } from "./performanceJson";
import { encodeWavPcm16 } from "./wavEncoder";
import { mixPcmTracks, resampleLinear } from "./mixer";
import { renderGuitarTrack } from "./guitarRenderer";

export interface ExportSessionOptions {
  vocal?: VocalCapture | null;
  guitarSampleRate?: number;
  renderGuitar?: typeof renderGuitarTrack;
  createOfflineContext?: GuitarRenderOptions["createOfflineContext"];
}

export async function exportSession(
  session: RecordedSession,
  options?: ExportSessionOptions,
): Promise<ExportResult> {
  const artifacts: ExportArtifact[] = [];
  const failures: ExportFailure[] = [];

  // Performance JSON (always attempted)
  try {
    const json = sessionToPerformanceJson(session);
    const blob = performanceJsonBlob(json);
    artifacts.push({
      kind: "performance-json",
      filename: `${session.sessionId}.performance.json`,
      blob,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ kind: "performance-json", message });
  }

  // Vocal WAV
  if (options?.vocal && options.vocal.samples.length > 0) {
    try {
      const blob = encodeWavPcm16(options.vocal.samples, options.vocal.sampleRate);
      artifacts.push({
        kind: "vocal-wav",
        filename: `${session.sessionId}.vocal.wav`,
        blob,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ kind: "vocal-wav", message });
    }
  }

  // Guitar WAV
  let guitarSamples: Float32Array | null = null;
  let guitarRate = options?.guitarSampleRate ?? 44100;

  try {
    const renderFn = options?.renderGuitar ?? renderGuitarTrack;
    const guitarResult = await renderFn(session, {
      sampleRate: guitarRate,
      createOfflineContext: options?.createOfflineContext,
    });
    guitarSamples = guitarResult.samples;
    guitarRate = guitarResult.sampleRate;
    const blob = encodeWavPcm16(guitarSamples, guitarRate);
    artifacts.push({
      kind: "guitar-wav",
      filename: `${session.sessionId}.guitar.wav`,
      blob,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ kind: "guitar-wav", message });
  }

  // Mix WAV
  const hasVocal = options?.vocal && options.vocal.samples.length > 0;
  const hasGuitar = guitarSamples !== null && guitarSamples.length > 0;

  if (hasVocal || hasGuitar) {
    try {
      const tracks: { samples: Float32Array; gain?: number }[] = [];
      let mixRate = guitarRate;

      if (hasVocal) {
        const vocal = options!.vocal!;
        let vocalSamples = vocal.samples;
        if (hasGuitar && vocal.sampleRate !== guitarRate) {
          vocalSamples = resampleLinear(vocalSamples, vocal.sampleRate, guitarRate);
        }
        tracks.push({ samples: vocalSamples, gain: 1.0 });
        if (!hasGuitar) {
          mixRate = vocal.sampleRate;
        }
      }

      if (hasGuitar) {
        tracks.push({ samples: guitarSamples!, gain: 0.9 });
      }

      const mix = mixPcmTracks(tracks);
      const blob = encodeWavPcm16(mix, mixRate);
      artifacts.push({
        kind: "mix-wav",
        filename: `${session.sessionId}.mix.wav`,
        blob,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ kind: "mix-wav", message });
    }
  } else {
    failures.push({ kind: "mix-wav", message: "No tracks available to mix" });
  }

  return { artifacts, failures, session };
}
