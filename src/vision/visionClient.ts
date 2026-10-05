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
  private previewEl: HTMLVideoElement | null = null;
  private stopped = false;
  private cancelWorkerInit: (() => void) | null = null;
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSendAt = 0;
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private canvasCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  private busy = false;
  private adaptiveController: AdaptiveTierController;
  private inferenceMsSamples: number[] = [];
  private frameTimestamps: number[] = [];
  private initResolved = false;
  private activeDelegate: "GPU" | "CPU" | null = null;
  private benchmark: { gpuMs: number | null; cpuMs: number | null } | null = null;

  constructor(options?: VisionClientOptions) {
    this.tier = options?.tier ?? "low";
    this.adaptive = options?.adaptive ?? false;
    this.onFrame = options?.onFrame;
    this.onError = options?.onError;
    this.onTierChange = options?.onTierChange;
    this.videoDeviceId = options?.videoDeviceId;
    this.adaptiveController = new AdaptiveTierController({ startTier: this.tier });
  }

  /**
   * Start the camera and the vision pipeline.
   * @param videoEl - video element that will display the camera feed
   */
  async start(videoEl: HTMLVideoElement): Promise<void> {
    // Capture belongs to the client, not a React screen that can unmount.
    this.videoEl = document.createElement("video");
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;
    this.setPreview(videoEl);
    try {
      await this.startStream();
      if (this.stopped) throw new Error("Camera startup cancelled");
      await this.initWorker();
      if (this.stopped) throw new Error("Camera startup cancelled");
      this.startPump();
    } catch (err) {
      this.stop();
      throw err;
    }
  }

  /** Rebind only the visible preview; inference keeps its own video source. */
  setPreview(el: HTMLVideoElement | null): void {
    if (this.previewEl && this.previewEl !== el) this.previewEl.srcObject = null;
    this.previewEl = el;
    if (el) {
      el.srcObject = this.stream;
      if (this.stream) void el.play().catch(() => undefined);
    }
  }

  private async startStream(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      const error: VisionClientError = { kind: "unsupported", message: "getUserMedia is not supported" };
      this.onError?.(error);
      throw new Error(error.message);
    }
    try {
      // Request a good source resolution once; per-tier scaling happens on
      // the analysis canvas, so tier changes never restart the stream.
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: VISION_TIERS.high.width },
          height: { ideal: VISION_TIERS.high.height },
          ...(this.videoDeviceId ? { deviceId: { exact: this.videoDeviceId } } : {}),
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.stopped) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Camera startup cancelled");
      }
      this.stream = stream;
    } catch (err) {
      this.handleGetUserMediaError(err);
      throw err;
    }
    this.videoEl!.srcObject = this.stream;
    this.setPreview(this.previewEl);
    await this.videoEl!.play();
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
      if (this.stopped) {
        reject(new Error("Camera startup cancelled"));
        return;
      }
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
      }, 20000); // generous: the worker benchmarks delegates during init
      this.cancelWorkerInit = () => {
        clearTimeout(timeout);
        this.initResolved = true;
        reject(new Error("Camera startup cancelled"));
      };

      worker.onmessage = (e: MessageEvent<VisionWorkerOutMessage>) => {
        if (this.stopped || this.worker !== worker) return;
        const msg = e.data;
        if (msg.type === "ready") {
          if (!this.initResolved) {
            this.initResolved = true;
            clearTimeout(timeout);
            this.cancelWorkerInit = null;
            this.activeDelegate = msg.delegate;
            this.benchmark = msg.benchmark;
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
            this.scheduleTick(50);
          }
        } else if (msg.type === "frame") {
          this.handleFrame(msg.frame);
        }
      };

      worker.onerror = (err) => {
        if (this.stopped || this.worker !== worker) return;
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
          this.scheduleTick(50);
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

    this.lastSendAt = 0;
    this.scheduleTick(0);
  }

  private stopPump(): void {
    if (this.pumpTimer) {
      clearTimeout(this.pumpTimer);
      this.pumpTimer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Self-scheduling pump: the next frame is sent as soon as the previous
   * response arrives (throttled to targetHz), so no time is lost waiting for
   * an interval boundary. A watchdog recovers the pump if a worker response
   * is ever lost — with a plain setInterval+busy design one lost response
   * freezes the pipeline at 0 fps forever.
   */
  private scheduleTick(delayMs: number): void {
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this.tick().catch((err) => {
        this.onError?.({ kind: "worker-error", message: String(err) });
        this.scheduleTick(250);
      });
    }, delayMs);
  }

  private armWatchdog(): void {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      if (this.busy) {
        // Response never arrived — drop the frame and keep the loop alive.
        this.busy = false;
        this.scheduleTick(0);
      }
    }, 1000);
  }

  private async tick(): Promise<void> {
    if (!this.videoEl || !this.worker || !this.canvas || !this.canvasCtx || this.busy) return;
    if (this.videoEl.readyState < 2) {
      this.scheduleTick(50);
      return;
    }

    this.busy = true;
    let bitmap: ImageBitmap | null = null;
    try {
      this.canvasCtx.drawImage(this.videoEl, 0, 0, this.canvas.width, this.canvas.height);
      bitmap =
        this.canvas instanceof OffscreenCanvas
          ? this.canvas.transferToImageBitmap() // zero-copy move
          : await createImageBitmap(this.canvas);
      const t = performance.now() / 1000;
      if (this.stopped || !this.worker) {
        bitmap.close();
        this.busy = false;
        return;
      }
      this.lastSendAt = performance.now();
      const msg: VisionWorkerInMessage = { type: "detect", bitmap, t };
      this.worker.postMessage(msg, [bitmap]);
      this.armWatchdog();
    } catch (err) {
      bitmap?.close();
      this.busy = false;
      throw err;
    }
  }

  private handleFrame(frame: VisionFrame): void {
    this.busy = false;
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
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

    // Schedule the next frame immediately, throttled to the tier rate.
    const intervalMs = 1000 / VISION_TIERS[this.tier].targetHz;
    const elapsed = performance.now() - this.lastSendAt;
    this.scheduleTick(Math.max(0, intervalMs - elapsed));
  }

  /** Change the active quality tier. Resizes the analysis canvas only —
   *  the camera stream itself is resolution-independent (we downscale), so
   *  tier changes are instant and never black out the pipeline. */
  setTier(id: VisionTier["id"]): void {
    if (id === this.tier) return;
    this.tier = id;
    this.adaptiveController.sync(id);
    this.onTierChange?.(id);
    if (this.canvas) {
      const tier = VISION_TIERS[id];
      // Assigning width/height also resets the 2D context state; drawImage
      // usage is unaffected.
      this.canvas.width = tier.width;
      this.canvas.height = tier.height;
    }
  }

  /** Return the current tier id. */
  getTier(): VisionTier["id"] {
    return this.tier;
  }

  /** Return recent performance statistics. */
  getStats(): {
    fps: number;
    avgInferenceMs: number;
    delegate: "GPU" | "CPU" | null;
    tier: VisionTier["id"];
    benchmark: { gpuMs: number | null; cpuMs: number | null } | null;
  } {
    const now = performance.now();
    while (this.frameTimestamps.length > 0 && this.frameTimestamps[0] < now - 1000) {
      this.frameTimestamps.shift();
    }
    const fps = this.frameTimestamps.length;
    const avgInferenceMs =
      this.inferenceMsSamples.length > 0
        ? this.inferenceMsSamples.reduce((a, b) => a + b, 0) / this.inferenceMsSamples.length
        : 0;
    return {
      fps,
      avgInferenceMs,
      delegate: this.activeDelegate,
      tier: this.tier,
      benchmark: this.benchmark,
    };
  }

  /** Stop everything and fully release the camera. */
  stop(): void {
    this.stopped = true;
    this.cancelWorkerInit?.();
    this.cancelWorkerInit = null;
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
    this.setPreview(null);
    this.canvas = null;
    this.canvasCtx = null;
    this.busy = false;
    this.frameTimestamps = [];
    this.inferenceMsSamples = [];
    this.activeDelegate = null;
    this.benchmark = null;
    this.adaptiveController.reset();
  }
}
