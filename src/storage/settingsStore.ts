/**
 * Application settings persistence with validation and defaults.
 */

import type { KeyValueAdapter } from "./adapters";
import { LocalStorageAdapter } from "./adapters";
import { MAJOR_KEYS, normalizeChordSymbol } from "../music/theory";
import { getPatternForMeter } from "../guided/patterns";

/** User-configurable application settings. */
export interface AppSettings {
  handedness: "right" | "left";
  mode: "free" | "guided" | "song";
  /** Musical key for Scale Mode, e.g. "C", "G". Null when unused. */
  key: string | null;
  chordMappingMode: "scale" | "custom";
  /** slot id -> chord symbol (custom mode). */
  customMapping: Record<string, string>;
  bpm: number;
  timeSignature: "4/4" | "3/4" | "6/8";
  metronomeOn: boolean;
  countInBars: number;
  instrumentPreset: string;
  /** Motion sensitivity multiplier. */
  sensitivity: number;
  /** Guided Rhythm pattern id (see src/guided/patterns.ts). */
  guidedPatternId: string;
  /** Song Mode progression: one chord symbol per bar. */
  songProgression: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  handedness: "right",
  mode: "free",
  key: "C",
  chordMappingMode: "scale",
  customMapping: {},
  bpm: 100,
  timeSignature: "4/4",
  metronomeOn: true,
  countInBars: 1,
  instrumentPreset: "acoustic-steel",
  sensitivity: 1,
  guidedPatternId: "down-beats",
  songProgression: ["C", "G", "Am", "F"],
};

export const SETTINGS_STORAGE_KEY = "ggw.settings.v1";

const ALLOWED_HANDEDNESS: AppSettings["handedness"][] = ["right", "left"];
const ALLOWED_MODES: AppSettings["mode"][] = ["free", "guided", "song"];
const ALLOWED_CHORD_MAPPING_MODES: AppSettings["chordMappingMode"][] = [
  "scale",
  "custom",
];
const ALLOWED_TIME_SIGNATURES: AppSettings["timeSignature"][] = [
  "4/4",
  "3/4",
  "6/8",
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Shallow-merge raw stored values over defaults and validate enums/ranges. */
function sanitize(raw: unknown): AppSettings {
  const merged: AppSettings = { ...DEFAULT_SETTINGS };

  if (!isObject(raw)) return merged;

  const p = raw as Record<string, unknown>;

  if (
    typeof p.handedness === "string" &&
    ALLOWED_HANDEDNESS.includes(p.handedness as AppSettings["handedness"])
  ) {
    merged.handedness = p.handedness as AppSettings["handedness"];
  }

  if (
    typeof p.mode === "string" &&
    ALLOWED_MODES.includes(p.mode as AppSettings["mode"])
  ) {
    merged.mode = p.mode as AppSettings["mode"];
  }

  if (p.key === null || typeof p.key === "string") {
    try {
      const key = normalizeChordSymbol(p.key ?? "C");
      if (MAJOR_KEYS.includes(key)) merged.key = key;
    } catch { /* Keep a playable default for corrupt persisted keys. */ }
  }

  if (
    typeof p.chordMappingMode === "string" &&
    ALLOWED_CHORD_MAPPING_MODES.includes(
      p.chordMappingMode as AppSettings["chordMappingMode"],
    )
  ) {
    merged.chordMappingMode = p.chordMappingMode as AppSettings["chordMappingMode"];
  }

  if (isObject(p.customMapping)) {
    merged.customMapping = {};
    for (const [slot, chord] of Object.entries(p.customMapping)) {
      if (!/^slot-[1-6]$/.test(slot) || typeof chord !== "string" || !chord) continue;
      try { merged.customMapping[slot] = normalizeChordSymbol(chord); } catch { /* Ignore invalid chords. */ }
    }
  }

  if (typeof p.bpm === "number" && !Number.isNaN(p.bpm)) {
    merged.bpm = clamp(p.bpm, 40, 240);
  }

  if (
    typeof p.timeSignature === "string" &&
    ALLOWED_TIME_SIGNATURES.includes(p.timeSignature as AppSettings["timeSignature"])
  ) {
    merged.timeSignature = p.timeSignature as AppSettings["timeSignature"];
  }

  if (typeof p.metronomeOn === "boolean") {
    merged.metronomeOn = p.metronomeOn;
  }

  if (typeof p.countInBars === "number" && !Number.isNaN(p.countInBars)) {
    merged.countInBars = clamp(Math.round(p.countInBars), 0, 4);
  }

  if (typeof p.instrumentPreset === "string") {
    merged.instrumentPreset = p.instrumentPreset;
  }

  if (typeof p.sensitivity === "number" && !Number.isNaN(p.sensitivity)) {
    merged.sensitivity = clamp(p.sensitivity, 0.25, 3);
  }

  if (typeof p.guidedPatternId === "string" && p.guidedPatternId.length > 0) {
    merged.guidedPatternId = p.guidedPatternId;
  }

  if (
    Array.isArray(p.songProgression) &&
    p.songProgression.every((c) => typeof c === "string") &&
    p.songProgression.length <= 128
  ) {
    merged.songProgression = p.songProgression as string[];
  }

  if (!getPatternForMeter(merged.guidedPatternId, merged.timeSignature)) {
    merged.guidedPatternId = "down-beats";
  }

  return merged;
}

/** Persistent store for {@link AppSettings}. */
export class SettingsStore {
  constructor(private adapter: KeyValueAdapter = new LocalStorageAdapter()) {}

  /** Load settings from storage, falling back to defaults on corruption or absence. */
  load(): AppSettings {
    try {
      const raw = this.adapter.get<unknown>(SETTINGS_STORAGE_KEY);
      if (raw === null) return { ...DEFAULT_SETTINGS };
      return sanitize(raw);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  /** Persist settings. */
  save(settings: AppSettings): void {
    this.adapter.set(SETTINGS_STORAGE_KEY, settings);
  }

  /**
   * Merge a partial patch into the current stored settings, persist, and return
   * the result.
   */
  update(patch: Partial<AppSettings>): AppSettings {
    const next = sanitize({ ...this.load(), ...patch });
    this.save(next);
    return next;
  }

  /** Clear stored settings and return defaults. */
  reset(): AppSettings {
    this.adapter.remove(SETTINGS_STORAGE_KEY);
    return { ...DEFAULT_SETTINGS };
  }
}
