import type { StrumEvent } from "../../performance/eventTypes";

/**
 * Narrow structural view of BaseAudioContext used by guitar engines.
 * Real AudioContext and OfflineAudioContext both satisfy it, and tests
 * substitute a fake — engines never touch DOM or global audio state.
 */
export interface GuitarAudioContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
  createGain(): GainNode;
  createBiquadFilter(): BiquadFilterNode;
}

/**
 * Stable guitar engine contract (AUDIO_ENGINE.md §6). All engines consume
 * performance events only — no camera/MediaPipe imports allowed here.
 */
export interface GuitarEngine {
  prepare(): Promise<void>;
  setPreset(id: string): void;
  setChord(chord: string): void;
  strum(event: StrumEvent): void;
  /**
   * Set mute state. `when` (audio-clock seconds) schedules the voice damping
   * for offline/export rendering; defaults to now for the live path.
   */
  setMuted(active: boolean, when?: number): void;
  stopAll(): void;
  connect(node: AudioNode): void;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
