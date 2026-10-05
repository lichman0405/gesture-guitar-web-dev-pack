export function mixPcmTracks(tracks: ReadonlyArray<{ samples: Float32Array; gain?: number }>): Float32Array {
  let maxLength = 0;
  for (const track of tracks) {
    if (track.samples.length > maxLength) {
      maxLength = track.samples.length;
    }
  }

  const mix = new Float32Array(maxLength);
  for (const track of tracks) {
    const gain = track.gain ?? 1;
    const samples = track.samples;
    for (let i = 0; i < samples.length; i++) {
      mix[i] += samples[i] * gain;
    }
  }

  let peak = 0;
  for (let i = 0; i < mix.length; i++) {
    const abs = Math.abs(mix[i]);
    if (abs > peak) {
      peak = abs;
    }
  }

  if (peak > 1) {
    const scale = 0.98 / peak;
    for (let i = 0; i < mix.length; i++) {
      mix[i] *= scale;
    }
  }

  return mix;
}

export function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    return new Float32Array(samples);
  }

  const ratio = fromRate / toRate;
  const outLength = Math.round(samples.length * toRate / fromRate);
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const index = Math.floor(srcIndex);
    const frac = srcIndex - index;

    if (index + 1 < samples.length) {
      out[i] = samples[index] * (1 - frac) + samples[index + 1] * frac;
    } else {
      out[i] = samples[index];
    }
  }

  return out;
}
