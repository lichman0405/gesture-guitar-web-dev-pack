import type { BeatInfo, Transport } from "./transport";

export interface MetronomeOptions {
  audible?: boolean;
  /** Visual pulse callback, fired as close to the actual beat time as setTimeout allows. */
  onVisualBeat?: (info: BeatInfo) => void;
  clickGain?: number;
}

const CLICK_FREQUENCIES: Record<BeatInfo["accent"], number> = {
  strong: 1760,
  medium: 1320,
  weak: 880,
};

const CLICK_GAINS: Record<BeatInfo["accent"], number> = {
  strong: 0.9,
  medium: 0.6,
  weak: 0.4,
};

/**
 * Metronome: consumes Transport beats, schedules short oscillator clicks at
 * exact audio times, and emits delayed visual pulses. Audible click can be
 * toggled independently of the visual pulse (acceptance test H).
 */
export class Metronome {
  private readonly ctx: BaseAudioContext;
  private readonly destination: AudioNode;
  private audible: boolean;
  private readonly onVisualBeat?: (info: BeatInfo) => void;
  private readonly clickGain: number;
  private unsubscribe: (() => void) | null = null;
  private pendingVisuals = new Set<ReturnType<typeof setTimeout>>();

  constructor(ctx: BaseAudioContext, destination: AudioNode, options: MetronomeOptions = {}) {
    this.ctx = ctx;
    this.destination = destination;
    this.audible = options.audible ?? true;
    this.onVisualBeat = options.onVisualBeat;
    this.clickGain = options.clickGain ?? 0.5;
  }

  setAudible(audible: boolean): void {
    this.audible = audible;
  }

  get isAudible(): boolean {
    return this.audible;
  }

  attach(transport: Transport): void {
    this.detach();
    this.unsubscribe = transport.addBeatListener((info) => this.handleBeat(info));
  }

  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.clearPendingVisuals();
  }

  /** Called by the wiring layer for every transport beat. */
  handleBeat(info: BeatInfo): void {
    if (this.audible) {
      this.scheduleClick(info);
    }
    const visualCb = this.onVisualBeat;
    if (visualCb) {
      const delayMs = Math.max(0, (info.audioTime - this.ctx.currentTime) * 1000);
      const timer = setTimeout(() => {
        this.pendingVisuals.delete(timer);
        visualCb(info);
      }, delayMs);
      this.pendingVisuals.add(timer);
    }
  }

  private scheduleClick(info: BeatInfo): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = CLICK_FREQUENCIES[info.accent];
    const t = info.audioTime;
    const peak = this.clickGain * CLICK_GAINS[info.accent];
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.destination);
    osc.start(t);
    osc.stop(t + 0.06);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  private clearPendingVisuals(): void {
    for (const timer of this.pendingVisuals) clearTimeout(timer);
    this.pendingVisuals.clear();
  }
}
