import type { StrumEvent } from "../../performance/eventTypes";
import type { GuitarAudioContext, GuitarEngine } from "./GuitarEngine";
import { ProceduralGuitarEngine } from "./ProceduralGuitarEngine";

/**
 * Placeholder for a future sample-based engine (AUDIO_ENGINE.md §1).
 *
 * Redistributable guitar samples are OPTIONAL and were not required for the
 * MVP, so this class currently delegates to the procedural engine behind the
 * stable GuitarEngine interface. If suitable samples become available, this
 * class can load and map them without any consumer changes.
 */
export class SampleGuitarEngine implements GuitarEngine {
  private readonly delegate: ProceduralGuitarEngine;

  constructor(ctx: GuitarAudioContext) {
    this.delegate = new ProceduralGuitarEngine(ctx);
  }

  prepare(): Promise<void> {
    return this.delegate.prepare();
  }
  setPreset(id: string): void {
    this.delegate.setPreset(id);
  }
  setChord(chord: string): void {
    this.delegate.setChord(chord);
  }
  strum(event: StrumEvent): void {
    this.delegate.strum(event);
  }
  setMuted(active: boolean): void {
    this.delegate.setMuted(active);
  }
  stopAll(): void {
    this.delegate.stopAll();
  }
  connect(node: AudioNode): void {
    this.delegate.connect(node);
  }
}
