/**
 * Application audio graph (AUDIO_ENGINE.md §7).
 *
 *   guitarEngine → guitarBus ──┬──────────────→ master → destination
 *                              └→ guitar recording taps
 *   mic → vocalBus ────────────┴→ vocal recording taps + meter
 *
 * Feedback safety: the microphone is NEVER routed to the speaker/master
 * path. Vocal monitoring is off by design for MVP.
 */
export class AudioGraph {
  private _ctx: AudioContext | null = null;
  private _master: GainNode | null = null;
  private _guitarBus: GainNode | null = null;
  private _vocalBus: GainNode | null = null;
  private _masterCompressor: DynamicsCompressorNode | null = null;

  /** Lazily creates the AudioContext (must be called from a user gesture path). */
  get ctx(): AudioContext {
    return this.ensureCreated();
  }

  private ensureCreated(): AudioContext {
    if (!this._ctx) {
      this._ctx = new AudioContext({ latencyHint: "interactive" });
      this._master = this._ctx.createGain();
      this._master.gain.value = 0.9;
      this._masterCompressor = this._ctx.createDynamicsCompressor();
      this._masterCompressor.threshold.value = -12;
      this._masterCompressor.knee.value = 20;
      this._masterCompressor.ratio.value = 4;
      this._master.connect(this._masterCompressor);
      this._masterCompressor.connect(this._ctx.destination);

      this._guitarBus = this._ctx.createGain();
      this._guitarBus.gain.value = 0.85;
      this._guitarBus.connect(this._master);

      // Vocal bus: recording/metering only — intentionally NOT connected
      // to master (no live vocal monitoring, prevents feedback).
      this._vocalBus = this._ctx.createGain();
      this._vocalBus.gain.value = 1;
    }
    return this._ctx;
  }

  get master(): GainNode {
    this.ensureCreated();
    return this._master!;
  }

  get guitarBus(): GainNode {
    this.ensureCreated();
    return this._guitarBus!;
  }

  get vocalBus(): GainNode {
    this.ensureCreated();
    return this._vocalBus!;
  }

  get isRunning(): boolean {
    return this._ctx?.state === "running";
  }

  /** Resume after a user gesture; safe to call repeatedly. */
  async ensureRunning(): Promise<void> {
    if (this._ctx && this._ctx.state !== "running") {
      await this._ctx.resume();
    }
  }

  setMasterVolume(volume: number): void {
    this.master.gain.value = clamp01(volume);
  }

  setGuitarVolume(volume: number): void {
    this.guitarBus.gain.value = clamp01(volume);
  }

  /** Tears down the whole graph (app shutdown). */
  async dispose(): Promise<void> {
    if (this._ctx) {
      await this._ctx.close().catch(() => undefined);
      this._ctx = null;
      this._master = null;
      this._guitarBus = null;
      this._vocalBus = null;
      this._masterCompressor = null;
    }
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
