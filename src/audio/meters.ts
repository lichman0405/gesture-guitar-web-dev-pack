/**
 * Lightweight RMS level meter backed by an AnalyserNode. UI polls getLevel()
 * on its own rAF cadence — the meter itself runs no timers.
 */
export class LevelMeter {
  private readonly analyser: AnalyserNode;
  private readonly buffer: Float32Array<ArrayBuffer>;
  private peakHold = 0;
  private peakHoldUntil = 0;

  constructor(ctx: BaseAudioContext, source: AudioNode) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buffer = new Float32Array(this.analyser.fftSize);
    source.connect(this.analyser);
  }

  /** Current RMS level 0..1. */
  getLevel(): number {
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      sum += this.buffer[i] * this.buffer[i];
    }
    const rms = Math.sqrt(sum / this.buffer.length);
    return Math.min(1, rms * 2.5);
  }

  /** RMS with a 1 s peak-hold envelope for nicer UI needles. */
  getLevelWithPeak(): { rms: number; peak: number } {
    const rms = this.getLevel();
    const now = performance.now();
    if (rms >= this.peakHold || now > this.peakHoldUntil) {
      this.peakHold = rms;
      this.peakHoldUntil = now + 1000;
    }
    return { rms, peak: this.peakHold };
  }

  disconnect(): void {
    this.analyser.disconnect();
  }
}
