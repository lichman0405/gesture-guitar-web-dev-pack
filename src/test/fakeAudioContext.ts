/** Minimal fake Web Audio nodes for node-side engine tests. */

export class FakeAudioParam {
  value = 0;
  readonly calls: { method: string; value: number; time: number; extra?: number }[] = [];

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push({ method: "setValueAtTime", value, time });
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push({ method: "linearRampToValueAtTime", value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push({ method: "exponentialRampToValueAtTime", value, time });
  }
  setTargetAtTime(value: number, time: number, timeConstant: number): void {
    this.value = value;
    this.calls.push({ method: "setTargetAtTime", value, time, extra: timeConstant });
  }
  cancelScheduledValues(time: number): void {
    this.calls.push({ method: "cancelScheduledValues", value: 0, time });
  }
}

export class FakeAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly data: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    return this.data[channel];
  }
}

export class FakeGainNode {
  readonly gain = new FakeAudioParam();
  readonly connections: unknown[] = [];
  connect(node: unknown): void {
    this.connections.push(node);
  }
  disconnect(): void {
    this.connections.length = 0;
  }
}

export class FakeBiquadFilterNode {
  type = "lowpass";
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
  readonly gain = new FakeAudioParam();
  readonly connections: unknown[] = [];
  connect(node: unknown): void {
    this.connections.push(node);
  }
  disconnect(): void {
    this.connections.length = 0;
  }
}

export class FakeBufferSourceNode {
  buffer: FakeAudioBuffer | null = null;
  readonly playbackRate = new FakeAudioParam();
  loop = false;
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  readonly connections: unknown[] = [];

  connect(node: unknown): void {
    this.connections.push(node);
  }
  disconnect(): void {
    this.connections.length = 0;
  }
  start(when = 0): void {
    this.startedAt = when;
  }
  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

export class FakeOscillatorNode {
  type = "sine";
  readonly frequency = new FakeAudioParam();
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  readonly connections: unknown[] = [];

  connect(node: unknown): void {
    this.connections.push(node);
  }
  disconnect(): void {
    this.connections.length = 0;
  }
  start(when = 0): void {
    this.startedAt = when;
  }
  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

export class FakeAudioContext {
  currentTime = 0;
  readonly sampleRate: number;
  state: "suspended" | "running" | "closed" = "running";
  readonly destination = { kind: "destination" };
  readonly createdSources: FakeBufferSourceNode[] = [];
  readonly createdGains: FakeGainNode[] = [];
  readonly createdFilters: FakeBiquadFilterNode[] = [];
  readonly createdBuffers: FakeAudioBuffer[] = [];

  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    const buffer = new FakeAudioBuffer(channels, length, sampleRate);
    this.createdBuffers.push(buffer);
    return buffer;
  }

  createBufferSource(): FakeBufferSourceNode {
    const source = new FakeBufferSourceNode();
    this.createdSources.push(source);
    return source;
  }

  createGain(): FakeGainNode {
    const gain = new FakeGainNode();
    this.createdGains.push(gain);
    return gain;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const filter = new FakeBiquadFilterNode();
    this.createdFilters.push(filter);
    return filter;
  }

  createDynamicsCompressor(): FakeGainNode & { threshold: FakeAudioParam; knee: FakeAudioParam; ratio: FakeAudioParam } {
    const node = new FakeGainNode() as FakeGainNode & {
      threshold: FakeAudioParam;
      knee: FakeAudioParam;
      ratio: FakeAudioParam;
    };
    node.threshold = new FakeAudioParam();
    node.knee = new FakeAudioParam();
    node.ratio = new FakeAudioParam();
    return node;
  }

  createOscillator(): FakeOscillatorNode {
    return new FakeOscillatorNode();
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }

  advanceTime(seconds: number): void {
    this.currentTime += seconds;
  }
}
