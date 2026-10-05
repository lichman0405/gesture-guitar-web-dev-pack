import type { VisionTier, VisionFrame, VisionWorkerInMessage, VisionWorkerOutMessage } from "./types";
import { VISION_TIERS } from "./types";
import { AdaptiveTierController } from "./adaptiveTier";

export interface VisionClientOptions {
  tier?: VisionTier["id"];
  adaptive?: boolean;
  onFrame?: (frame: VisionFrame) => void;
  onError?: (error: VisionClientError) => void;
  onTierChange?: (tier: VisionTier["id"]) => void;
  videoDeviceId?: string;
}

export interface VisionClientError {
  kind: "denied" | "no-device" | "unsupported" | "worker-error" | "timeout";
  message: string;
}

/**
 * Main-thread client that manages the camera stream, the vision worker,
 * and the adaptive quality tier.
 */
export class VisionClient {
  private tier: VisionTier["id"];
  private adaptive: boolean;
  private onFrame?: (frame: VisionFrame) => void;
  private onError?: (error: VisionClientError) => void;
  private onTierChange?: (tier: VisionTier["id"]) => void;
  private videoDeviceId?: string;

  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private pumpHandle: ReturnType<typeof setInterval> | null = null;
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private canvasCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  private busy = false;
  private adaptiveController: AdaptiveTierController;
  private inferenceMsSamples: number[] = [];
  private frameTimestamps: number[] = [];
  private initResolved = false;

  constructor(options?: VisionClientOptions) {
    this.tier = options?.tier ?? "medium";
    this.adaptive = options?.adaptive ?? false;
    this.onFrame = options?.onFrame;
    this.onError = options?.onError;
    this.onTierChange = options?.onTierChange;
    this.videoDeviceId = options?.videoDeviceId;
    this.adaptiveController = new AdaptiveTierController();
  }

  /**
   * Start the camera and the vision pipeline.
   * @param videoEl - video element that will display the camera feed
   */
  async start(videoEl: HTMLVideoElement): Promise<void> {
    this.videoEl = videoEl;
    await this.startStream();
    await this.initWorker();
    this.startPump();
  }

  private async startStream(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      const error: VisionClientError = { kind: "unsupported", message: "getUserMedia is not supported" };
      this.onError?.(error);
      throw new Error(error.message);
    }
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: VISION_TIERS[this.tier].width },
          height: { ideal: VISION_TIERS[this.tier].height },
          ...(this.videoDeviceId ? { deviceId: { exact: this.videoDeviceId } } : {}),
        },
        audio: false,
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      this.handleGetUserMediaError(err);
      throw err;
    }
    this.videoEl!.srcObject = this.stream;
    await new Promise<void>((resolve, reject) => {
      const el = this.videoEl!;
      el.onloadedmetadata = () => resolve();
      el.onerror = () => reject(new Error("video element error"));
      el.play().catch(reject);
    });
  }

  private handleGetUserMediaError(err: unknown): void {
    let error: VisionClientError;
    if (err instanceof DOMException) {
      if (err.name === "NotAllowedError") {
        error = { kind: "denied", message: err.message };
      } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        error = { kind: "no-device", message: err.message };
      } else {
        error = { kind: "unsupported", message: err.message };
      }
    } else {
      error = { kind: "unsupported", message: String(err) };
    }
    this.onError?.(error);
  }

  private async initWorker(delegate: "GPU" | "CPU" = "GPU"): Promise<void> {
    return new Promise((resolve, reject) => {
      this.initResolved = false;
      const worker = new Worker(
        new URL("./handLandmarker.worker.ts", import.meta.url),
        { type: "module" }
      );
      this.worker = worker;

      const timeout = setTimeout(() => {
        if (!this.initResolved) {
          this.initResolved = true;
          if (delegate === "GPU") {
            this.terminateWorker();
            this.initWorker("CPU").then(resolve).catch(reject);
          } else {
            this.onError?.({ kind: "timeout", message: "Worker initialization timed out" });
            reject(new Error("Worker init timeout"));
          }
        }
      }, 8000);

      worker.onmessage = (e: MessageEvent<VisionWorkerOutMessage>) => {
        const msg = e.data;
        if (msg.type === "ready") {
          if (!this.initResolved) {
            this.initResolved = true;
            clearTimeout(timeout);
            resolve();
          }
        } else if (msg.type === "error") {
          if (!this.initResolved) {
            this.initResolved = true;
            clearTimeout(timeout);
            if (delegate === "GPU") {
              this.terminateWorker();
              this.initWorker("CPU").then(resolve).catch(reject);
            } else {
              this.onError?.({ kind: "worker-error", message: msg.message });
              reject(new Error(msg.message));
            }
          } else {
            this.onError?.({ kind: "worker-error", message: msg.message });
            this.busy = false;
          }
        } else if (msg.type === "frame") {
          this.handleFrame(msg.frame);
        }
      };

      worker.onerror = (err) => {
        if (!this.initResolved) {
          this.initResolved = true;
          clearTimeout(timeout);
          if (delegate === "GPU") {
            this.terminateWorker();
            this.initWorker("CPU").then(resolve).catch(reject);
          } else {
            this.onError?.({ kind: "worker-error", message: err.message });
            reject(new Error(err.message));
          }
        } else {
          this.onError?.({ kind: "worker-error", message: err.message });
          this.busy = false;
        }
      };

      const initMsg: VisionWorkerInMessage = {
        type: "init",
        wasmBaseUrl: new URL("/vendor/mediapipe-wasm", location.href).href,
        modelUrl: new URL("/models/hand_landmarker.task", location.href).href,
        maxHands: 2,
        delegate,
      };
      worker.postMessage(initMsg);
    });
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private startPump(): void {
    const tier = VISION_TIERS[this.tier];
    const intervalMs = 1000 / tier.targetHz;

    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(tier.width, tier.height);
      this.canvasCtx = this.canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = tier.width;
      canvas.height = tier.height;
      this.canvas = canvas;
      this.canvasCtx = canvas.getContext("2d") as CanvasRenderingContext2D;
    }

    this.pumpHandle = setInterval(() => {
      this.tick().catch((err) => {
        this.onError?.({ kind: "worker-error", message: String(err) });
      });
    }, intervalMs);
  }

  private stopPump(): void {
    if (this.pumpHandle) {
      clearInterval(this.pumpHandle);
      this.pumpHandle = null;
    }
  }

  private async tick(): Promise<void> {
    if (!this.videoEl || !this.worker || !this.canvas || !this.canvasCtx || this.busy) return;
    if (this.videoEl.readyState < 2) return;

    this.busy = true;
    let bitmap: ImageBitmap | null = null;
    try {
      this.canvasCtx.drawImage(this.videoEl, 0, 0, this.canvas.width, this.canvas.height);
      bitmap = await createImageBitmap(this.canvas);
      const t = performance.now() / 1000;
      const msg: VisionWorkerInMessage = { type: "detect", bitmap, t };
      this.worker.postMessage(msg, [bitmap]);
    } catch (err) {
      bitmap?.close();
      this.busy = false;
      throw err;
    }
  }

  private handleFrame(frame: VisionFrame): void {
    this.busy = false;
    this.onFrame?.(frame);

    const now = performance.now();
    this.frameTimestamps.push(now);
    while (this.frameTimestamps.length > 0 && this.frameTimestamps[0] < now - 1000) {
      this.frameTimestamps.shift();
    }

    this.inferenceMsSamples.push(frame.inferenceMs);
    if (this.inferenceMsSamples.length > 60) {
      this.inferenceMsSamples.shift();
    }

    if (this.adaptive) {
      this.adaptiveController.addSample(frame.inferenceMs, frame.t);
      const newTier = this.adaptiveController.currentTier;
      if (newTier !== this.tier) {
        this.setTier(newTier);
      }
    }
  }

  /** Change the active quality tier. */
  setTier(id: VisionTier["id"]): void {
    if (id === this.tier) return;
    this.tier = id;
    this.adaptiveController.reset();
    this.onTierChange?.(id);
    if (this.videoEl && this.stream) {
      this.stopPump();
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.videoEl.srcObject = null;
      this.startStream().then(() => {
        this.startPump();
      }).catch(() => {
        // Error already reported via onError
      });
    }
  }

  /** Return the current tier id. */
  getTier(): VisionTier["id"] {
    return this.tier;
  }

  /** Return recent performance statistics. */
  getStats(): { fps: number; avgInferenceMs: number } {
    const now = performance.now();
    while (this.frameTimestamps.length > 0 && this.frameTimestamps[0] < now - 1000) {
      this.frameTimestamps.shift();
    }
    const fps = this.frameTimestamps.length;
    const avgInferenceMs =
      this.inferenceMsSamples.length > 0
        ? this.inferenceMsSamples.reduce((a, b) => a + b, 0) / this.inferenceMsSamples.length
        : 0;
    return { fps, avgInferenceMs };
  }

  /** Stop everything and fully release the camera. */
  stop(): void {
    this.stopPump();
    this.terminateWorker();
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    this.canvas = null;
    this.canvasCtx = null;
    this.busy = false;
    this.frameTimestamps = [];
    this.inferenceMsSamples = [];
    this.adaptiveController.reset();
  }
}
