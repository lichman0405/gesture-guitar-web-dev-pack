/**
 * Karplus–Strong plucked-string synthesis — pure DSP, no Web Audio dependency.
 * Runs in node for tests; buffers are played through AudioBufferSourceNode
 * in the browser engine.
 */

export interface PluckOptions {
  /** Fundamental frequency in Hz. */
  frequency: number;
  sampleRate: number;
  /** Target length of the rendered buffer in seconds. */
  durationSeconds: number;
  /** Time for the string to decay to ~-60 dB. Shorter = deader. */
  decaySeconds: number;
  /** 0..1 — lowpass on the excitation burst and loop filter (darker when low). */
  brightness: number;
  /** 0..1 output level. */
  intensity: number;
  /** Muted (palm-mute) articulation: very short, dark, percussive. */
  muted?: boolean;
  /** RNG seed for reproducible output (tests). */
  seed?: number;
}

/** Small deterministic LCG so renders are reproducible in tests. */
function createRng(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * Renders one plucked-string note into a mono Float32Array, peak-normalized
 * to `intensity` with a short fade-out tail to avoid clicks.
 */
export function renderKarplusStrongPluck(options: PluckOptions): Float32Array {
  const {
    frequency,
    sampleRate,
    durationSeconds,
    brightness,
    intensity,
    muted = false,
    seed = 123456789,
  } = options;

  if (!(frequency > 0)) throw new Error(`Invalid frequency: ${frequency}`);
  if (!(sampleRate > 0)) throw new Error(`Invalid sampleRate: ${sampleRate}`);

  const decaySeconds = muted ? Math.min(options.decaySeconds, 0.12) : options.decaySeconds;
  const length = Math.max(1, Math.round(durationSeconds * sampleRate));
  const out = new Float32Array(length);

  const period = Math.max(2, Math.round(sampleRate / frequency));
  const rng = createRng(seed);

  // Excitation: noise burst, lowpassed according to brightness (one-pole).
  const delay = new Float32Array(period + 1);
  const lpCoeff = 0.05 + 0.9 * Math.min(1, Math.max(0, brightness)) * (muted ? 0.55 : 1);
  let lpState = 0;
  for (let i = 0; i < period; i++) {
    const white = rng() * 2 - 1;
    lpState = lpState + lpCoeff * (white - lpState);
    delay[i] = lpState;
  }

  // Loop gain per period to reach -60 dB after decaySeconds.
  // gain^(frequency * decaySeconds) = 0.001
  const loopGain = Math.pow(0.001, 1 / (frequency * Math.max(0.02, decaySeconds)));

  // First period is the excitation itself.
  const copyLen = Math.min(period, length);
  for (let i = 0; i < copyLen; i++) out[i] = delay[i];

  // KS loop: averaging lowpass + per-period loop gain for the target decay.
  const blend = 0.5;
  for (let n = period; n < length; n++) {
    const a = out[n - period];
    const b = n - period - 1 >= 0 ? out[n - period - 1] : delay[period - 1];
    out[n] = loopGain * (a * (1 - blend) + b * blend);
  }

  // Normalize peak to intensity (leave headroom for multi-string sums).
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const abs = Math.abs(out[i]);
    if (abs > peak) peak = abs;
  }
  const targetPeak = Math.min(1, Math.max(0, intensity)) * 0.9;
  const scale = peak > 1e-6 ? targetPeak / peak : 0;
  for (let i = 0; i < length; i++) out[i] *= scale;

  // 5 ms fade-out to avoid end-click.
  const fade = Math.min(length, Math.round(0.005 * sampleRate));
  for (let i = 0; i < fade; i++) {
    out[length - 1 - i] *= 1 - i / fade;
  }

  return out;
}

/** Rough utility: RMS energy of a buffer slice. */
export function rmsEnergy(buf: Float32Array, from = 0, to = buf.length): number {
  let sum = 0;
  const clampedTo = Math.min(to, buf.length);
  for (let i = from; i < clampedTo; i++) sum += buf[i] * buf[i];
  return clampedTo > from ? Math.sqrt(sum / (clampedTo - from)) : 0;
}

/**
 * Estimates fundamental frequency via normalized autocorrelation with
 * parabolic interpolation. Robust for periodic (plucked-string) signals
 * where zero-crossing rate is fooled by harmonics.
 */
export function estimateFundamental(buf: Float32Array, sampleRate: number): number {
  const minLag = Math.max(2, Math.floor(sampleRate / 2000));
  const maxLag = Math.min(Math.floor(sampleRate / 50), Math.floor(buf.length / 2));
  const start = Math.floor(buf.length * 0.05);
  const windowLength = Math.min(buf.length - start - maxLag, maxLag * 2);
  if (windowLength <= 0) return 0;

  const autoCorr = (lag: number): number => {
    let sum = 0;
    for (let i = 0; i < windowLength; i++) {
      sum += buf[start + i] * buf[start + i + lag];
    }
    return sum;
  };

  let r0 = 0;
  for (let i = 0; i < windowLength; i++) r0 += buf[start + i] * buf[start + i];
  if (r0 < 1e-9) return 0;

  let bestLag = -1;
  let bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const val = autoCorr(lag) / r0;
    if (val > bestVal) {
      bestVal = val;
      bestLag = lag;
    }
  }
  if (bestLag < 0) return 0;

  // Parabolic interpolation for sub-sample lag accuracy.
  const y0 = autoCorr(bestLag - 1) / r0;
  const y1 = bestVal;
  const y2 = autoCorr(bestLag + 1) / r0;
  const denom = y0 - 2 * y1 + y2;
  const refinedLag = Math.abs(denom) > 1e-12 ? bestLag + 0.5 * (y0 - y2) / denom : bestLag;

  return sampleRate / refinedLag;
}
