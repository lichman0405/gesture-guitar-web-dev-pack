import type { StrumEvent } from "../../performance/eventTypes";
import { getVoicing, normalizeChordSymbol } from "../theory";
import type { GuitarStringNote } from "../theory";
import { getPreset, DEFAULT_PRESET_ID } from "./InstrumentPreset";
import type { InstrumentPreset } from "./InstrumentPreset";
import { renderKarplusStrongPluck } from "./karplusStrong";
import { midiToFrequency } from "./GuitarEngine";
import type { GuitarAudioContext, GuitarEngine } from "./GuitarEngine";

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  stringIndex: number;
}

export interface ProceduralGuitarEngineOptions {
  /** Seed base for deterministic KS renders (tests). */
  seedBase?: number;
  /** Max cached string buffers (LRU). */
  maxCachedBuffers?: number;
  /** Number of excitation variants rotated per note for organic repetition. */
  variantsPerNote?: number;
}

const DEFAULT_CHORD = "C";
const LIVE_SCHEDULE_AHEAD_SECONDS = 0.004;

/**
 * Karplus–Strong plucked-string guitar engine (AUDIO_ENGINE.md §2–§5).
 *
 * - One physical string slot per guitar string; real voicings from theory.
 * - Strums schedule per-string triggers with direction/intensity-dependent
 *   spacing on the audio clock (never setTimeout).
 * - Buffers are cached per (preset, midi, articulation, variant) with LRU
 *   eviction; intensity is applied at trigger time via gain + lowpass, so
 *   cached buffers serve all dynamics.
 * - Works against any GuitarAudioContext: live AudioContext for playback,
 *   OfflineAudioContext for deterministic export rendering.
 */
export class ProceduralGuitarEngine implements GuitarEngine {
  private readonly ctx: GuitarAudioContext;
  private readonly output: GainNode;
  private readonly seedBase: number;
  private readonly maxCachedBuffers: number;
  private readonly variantsPerNote: number;

  private preset: InstrumentPreset;
  private voicing: GuitarStringNote[];
  private currentChord: string;
  private muted = false;
  private prepared = false;

  private readonly bufferCache = new Map<string, AudioBuffer>();
  private variantRotation = 0;
  private readonly voices: (ActiveVoice | null)[] = [null, null, null, null, null, null];

  constructor(ctx: GuitarAudioContext, options: ProceduralGuitarEngineOptions = {}) {
    this.ctx = ctx;
    this.seedBase = options.seedBase ?? 1234;
    this.maxCachedBuffers = options.maxCachedBuffers ?? 64;
    this.variantsPerNote = options.variantsPerNote ?? 3;
    this.preset = getPreset(DEFAULT_PRESET_ID);
    this.currentChord = DEFAULT_CHORD;
    this.voicing = getVoicing(DEFAULT_CHORD);
    this.output = ctx.createGain();
    this.output.gain.value = 1;
  }

  async prepare(): Promise<void> {
    // Pre-render current chord so the first strum has no render hitch.
    for (const stringNote of this.voicing) {
      if (stringNote.midi !== null) {
        this.getBuffer(stringNote.midi, false);
      }
    }
    this.prepared = true;
  }

  setPreset(id: string): void {
    this.preset = getPreset(id);
    // Buffers are keyed by preset id, so stale entries are harmless; keep
    // them (LRU will evict) to allow fast preset switching back.
  }

  get presetId(): string {
    return this.preset.id;
  }

  setChord(chord: string): void {
    const normalized = normalizeChordSymbol(chord);
    this.currentChord = normalized;
    this.voicing = getVoicing(normalized);
  }

  get chord(): string {
    return this.currentChord;
  }

  get isPrepared(): boolean {
    return this.prepared;
  }

  /** Live-path strum: schedule almost immediately on the audio clock. */
  strum(event: StrumEvent): void {
    this.scheduleStrum(event, this.ctx.currentTime + LIVE_SCHEDULE_AHEAD_SECONDS);
  }

  /**
   * Offline/export path: schedule a strum at an absolute audio time,
   * e.g. offlineStart + event.t when re-rendering a recorded event log.
   */
  scheduleStrum(event: StrumEvent, when: number): void {
    const order = event.direction === "down" ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
    const baseSpacingMs =
      event.direction === "down" ? this.preset.strumSpacingMs.down : this.preset.strumSpacingMs.up;
    // Softer strums spread wider; accents stay tight. Clamp to sane bounds.
    const spacingMs = Math.min(
      40,
      Math.max(3, baseSpacingMs * (1 + (1 - event.intensity) * (1 + this.preset.spacingVelocityScale))),
    );

    const articulationMuted = event.articulation === "muted" || this.muted;
    let step = 0;
    for (const stringIndex of order) {
      const stringNote = this.voicing[stringIndex];
      if (!stringNote || stringNote.midi === null) continue;
      const startTime = when + (step * spacingMs) / 1000;
      this.triggerString(stringIndex, stringNote.midi, articulationMuted, event.intensity, startTime);
      step++;
    }
  }

  setMuted(active: boolean, when?: number): void {
    if (active === this.muted) return;
    this.muted = active;
    if (active) {
      this.dampAllVoices(0.025, when);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  stopAll(): void {
    this.dampAllVoices(0.015);
  }

  connect(node: AudioNode): void {
    this.output.connect(node);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  /** Visible for tests: number of cached string buffers. */
  get cachedBufferCount(): number {
    return this.bufferCache.size;
  }

  private triggerString(
    stringIndex: number,
    midi: number,
    mutedArticulation: boolean,
    intensity: number,
    when: number,
  ): void {
    this.chokeStringVoice(stringIndex, when);

    const buffer = this.getBuffer(midi, mutedArticulation);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    const brightnessHz = mutedArticulation
      ? 900 + intensity * 1200
      : 1800 + intensity * 7200 * this.preset.brightness;
    filter.frequency.value = brightnessHz;

    const gain = this.ctx.createGain();
    const level = Math.pow(Math.min(1, Math.max(0, intensity)), 1.2) * (mutedArticulation ? 0.5 : 0.9);
    gain.gain.value = level;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);

    source.start(when);
    source.stop(when + buffer.duration + 0.05);

    const voice: ActiveVoice = { source, gain, filter, stringIndex };
    this.voices[stringIndex] = voice;
    source.onended = () => {
      if (this.voices[stringIndex] === voice) this.voices[stringIndex] = null;
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /** Quick 10 ms choke of the current voice on one string (retrigger). */
  private chokeStringVoice(stringIndex: number, when: number): void {
    const voice = this.voices[stringIndex];
    if (!voice) return;
    this.voices[stringIndex] = null;
    const gainParam = voice.gain.gain;
    gainParam.cancelScheduledValues(when);
    gainParam.setTargetAtTime(0, when, 0.01);
    try {
      voice.source.stop(when + 0.05);
    } catch {
      // already stopped
    }
  }

  /** Fast damp of every ringing voice (mute gesture / stopAll). */
  private dampAllVoices(timeConstant: number, when?: number): void {
    const now = when ?? this.ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i];
      if (!voice) continue;
      this.voices[i] = null;
      const gainParam = voice.gain.gain;
      gainParam.cancelScheduledValues(now);
      gainParam.setTargetAtTime(0, now, timeConstant);
      try {
        voice.source.stop(now + timeConstant * 8);
      } catch {
        // already stopped
      }
    }
  }

  private getBuffer(midi: number, mutedArticulation: boolean): AudioBuffer {
    this.variantRotation = (this.variantRotation + 1) % this.variantsPerNote;
    const key = `${this.preset.id}|${midi}|${mutedArticulation ? 1 : 0}|${this.variantRotation}`;
    const cached = this.bufferCache.get(key);
    if (cached) {
      // Refresh LRU position.
      this.bufferCache.delete(key);
      this.bufferCache.set(key, cached);
      return cached;
    }

    const sampleRate = this.ctx.sampleRate;
    const decaySeconds = mutedArticulation ? 0.09 : this.preset.decaySeconds;
    const durationSeconds = mutedArticulation ? 0.35 : this.preset.decaySeconds + 0.25;
    const rendered = renderKarplusStrongPluck({
      frequency: midiToFrequency(midi),
      sampleRate,
      durationSeconds,
      decaySeconds,
      brightness: mutedArticulation ? this.preset.brightness * 0.5 : this.preset.brightness,
      intensity: 1,
      muted: mutedArticulation,
      seed: this.seedBase + midi * 131 + this.variantRotation,
    });

    const buffer = this.ctx.createBuffer(1, rendered.length, sampleRate);
    buffer.getChannelData(0).set(rendered);
    this.bufferCache.set(key, buffer);

    while (this.bufferCache.size > this.maxCachedBuffers) {
      const oldest = this.bufferCache.keys().next().value;
      if (oldest === undefined) break;
      this.bufferCache.delete(oldest);
    }
    return buffer;
  }
}
