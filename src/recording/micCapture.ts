import type { VocalCapture } from "./types";
import pcmWorkletUrl from "./pcmCaptureWorklet.ts?worker&url";

export interface MicRequestResult {
  stream: MediaStream | null;
  error: string | null;
}

export async function requestMicrophone(): Promise<MicRequestResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    return { stream, error: null };
  } catch (err) {
    let message = "无法访问麦克风，请检查设备连接与网站权限。";
    if (err instanceof DOMException) {
      if (err.name === "NotAllowedError") {
        message = "麦克风权限被拒绝，请在浏览器的网站权限设置中允许访问。";
      } else if (err.name === "NotFoundError") {
        message = "未找到麦克风，请连接设备后重试。";
      } else if (err.name === "NotReadableError") {
        message = "麦克风无法读取，请关闭其他占用麦克风的应用后重试。";
      }
    }
    console.warn("Microphone access failed", err);
    return { stream: null, error: message };
  }
}

export class MicCapture {
  private ctx: BaseAudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  private capturing = false;

  async start(ctx: BaseAudioContext, stream: MediaStream): Promise<void> {
    if (this.capturing) return;
    this.ctx = ctx;
    this.chunks = [];

    await ctx.audioWorklet.addModule(pcmWorkletUrl);

    this.sourceNode = new MediaStreamAudioSourceNode(ctx as AudioContext, { mediaStream: stream });
    this.workletNode = new AudioWorkletNode(ctx as AudioContext, "pcm-capture");
    this.workletNode.port.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data instanceof Float32Array) {
        this.chunks.push(event.data);
      }
    };

    this.sourceNode.connect(this.workletNode);
    // The processor emits silence; connect its output so browsers pull input.
    this.workletNode.connect((ctx as AudioContext).destination);
    this.capturing = true;
  }

  stop(): VocalCapture {
    if (!this.capturing) {
      return {
        samples: new Float32Array(0),
        sampleRate: this.ctx?.sampleRate ?? 48000,
        startOffsetSeconds: 0,
      };
    }

    this.capturing = false;

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.onmessage = null;
      this.workletNode = null;
    }

    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];

    return {
      samples,
      sampleRate: this.ctx?.sampleRate ?? 48000,
      startOffsetSeconds: 0,
    };
  }

  get isCapturing(): boolean {
    return this.capturing;
  }

  dispose(): void {
    this.stop();
    this.ctx = null;
  }
}
