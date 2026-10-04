import { BeatGrid } from "./beatGrid";
import type { BeatPosition } from "./beatGrid";

export interface BeatInfo {
  /** Absolute beat index since transport start (count-in included). */
  beatIndex: number;
  bar: number;
  beatInBar: number;
  inCountIn: boolean;
  accent: "strong" | "medium" | "weak";
  /** AudioContext time at which this beat occurs — schedule clicks here. */
  audioTime: number;
}

export type TransportState = "stopped" | "running";

export interface TransportOptions {
  /** How far ahead of the audio clock beats are emitted (seconds). */
  lookaheadSeconds?: number;
  /** Scheduler tick interval (ms). */
  intervalMs?: number;
  onStateChange?: (state: TransportState) => void;
}

/**
 * Audio-clock-driven beat scheduler. Uses a short-interval timer with a
 * lookahead horizon (standard Web Audio scheduling pattern): musical timing
 * derives from `ctx.currentTime`, never from setTimeout jitter.
 *
 * Consumers receive beat callbacks slightly ahead of time and must schedule
 * audio at `info.audioTime`; visual pulses should delay themselves to
 * audioTime. Multiple listeners are supported (metronome, guided mode, UI).
 */
export class Transport {
  private readonly ctx: BaseAudioContext;
  private readonly lookahead: number;
  private readonly intervalMs: number;
  private readonly onStateChange?: (state: TransportState) => void;
  private beatListeners = new Set<(info: BeatInfo) => void>();

  private timer: ReturnType<typeof setInterval> | null = null;
  private startCtxTime = 0;
  private nextBeatIndex = 0;
  private state: TransportState = "stopped";

  constructor(
    ctx: BaseAudioContext,
    readonly grid: BeatGrid,
    options: TransportOptions = {},
  ) {
    this.ctx = ctx;
    this.lookahead = options.lookaheadSeconds ?? 0.12;
    this.intervalMs = options.intervalMs ?? 25;
    this.onStateChange = options.onStateChange;
  }

  addBeatListener(listener: (info: BeatInfo) => void): () => void {
    this.beatListeners.add(listener);
    return () => {
      this.beatListeners.delete(listener);
    };
  }

  get running(): boolean {
    return this.state === "running";
  }

  /** AudioContext time corresponding to grid beat 0. Null when stopped. */
  get originTime(): number | null {
    return this.state === "running" ? this.startCtxTime : null;
  }

  start(startDelaySeconds = 0.05): void {
    if (this.state === "running") return;
    this.startCtxTime = this.ctx.currentTime + startDelaySeconds;
    this.nextBeatIndex = 0;
    this.setState("running");
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.state === "stopped") return;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.setState("stopped");
  }

  /** Position at an AudioContext time, or null when stopped. */
  positionAt(ctxTime: number): BeatPosition | null {
    if (this.state !== "running") return null;
    const rel = ctxTime - this.startCtxTime;
    return this.grid.positionAt(Math.max(0, rel));
  }

  private tick(): void {
    const horizon = this.ctx.currentTime + this.lookahead;
    while (true) {
      const beatAudioTime = this.startCtxTime + this.grid.beatTime(this.nextBeatIndex);
      if (beatAudioTime > horizon) break;
      const musical = this.nextBeatIndex - this.grid.countInBeats;
      const inCountIn = musical < 0;
      const { bar, beatInBar } = inCountIn
        ? this.grid.positionAt(this.grid.beatTime(this.nextBeatIndex))
        : this.grid.barBeatAt(musical);
      const info: BeatInfo = {
        beatIndex: this.nextBeatIndex,
        bar,
        beatInBar,
        inCountIn,
        accent: this.grid.accentLevel(beatInBar),
        audioTime: beatAudioTime,
      };
      for (const listener of [...this.beatListeners]) {
        listener(info);
      }
      this.nextBeatIndex++;
    }
  }

  private setState(state: TransportState): void {
    this.state = state;
    this.onStateChange?.(state);
  }
}
