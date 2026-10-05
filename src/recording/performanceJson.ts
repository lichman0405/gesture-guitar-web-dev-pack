import type { RecordedSession } from "../performance/session";
import { PERFORMANCE_JSON_VERSION } from "../performance/eventTypes";

/**
 * Shape validated by schemas/performance.schema.json. Keep in sync; the
 * unit test re-checks required fields and enums against the schema file.
 */
export interface PerformanceJson {
  version: string;
  sessionId: string;
  startedAt: string;
  settings: {
    handedness: "right" | "left";
    mode: "free" | "guided" | "song";
    key: string | null;
    bpm: number;
    timeSignature: "4/4" | "3/4" | "6/8";
    instrumentPreset: string;
    chordMappingMode?: string;
    customMapping?: Record<string, string>;
  };
  events: RecordedSession["events"];
  songPlan?: object | null;
  evaluation?: object | null;
}

/** Build the schema-conformant export document for a recorded session. */
export function sessionToPerformanceJson(
  session: RecordedSession,
  extras?: { songPlan?: object | null; evaluation?: object | null },
): PerformanceJson {
  const s = session.settings;
  return {
    version: PERFORMANCE_JSON_VERSION,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    settings: {
      handedness: s.handedness,
      mode: s.mode,
      key: s.key ?? null,
      bpm: s.bpm,
      timeSignature: s.timeSignature,
      instrumentPreset: s.instrumentPreset,
      chordMappingMode: s.chordMappingMode,
      customMapping: s.customMapping,
    },
    events: session.events,
    songPlan: extras?.songPlan ?? null,
    evaluation: extras?.evaluation ?? null,
  };
}

export function performanceJsonBlob(json: PerformanceJson): Blob {
  return new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
}
