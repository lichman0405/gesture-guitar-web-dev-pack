import { VisionClient } from "../vision/visionClient";
import type { VisionClientError } from "../vision/visionClient";
import type { VisionFrame, VisionTier } from "../vision/types";
import { VisionPipeline } from "./visionPipeline";
import type { PipelineDebugStats } from "./visionPipeline";
import type { EventBus } from "../performance/eventBus";
import type { Handedness } from "../performance/eventTypes";
import type { CalibrationData } from "../motion/calibrationTypes";
import { LocalStorageAdapter } from "../storage/adapters";
import type { KeyValueAdapter } from "../storage/adapters";

export type VisionSessionState = "idle" | "starting" | "running" | "error" | "stopped";

export interface VisionSessionOptions {
  bus: EventBus;
  handedness: Handedness;
  resolveSlotChord: (slotId: string) => string | null;
  isRecording?: () => boolean;
  adaptive?: boolean;
  onStateChange?: (state: VisionSessionState) => void;
  onError?: (error: VisionClientError) => void;
  onTierChange?: (tier: VisionTier["id"]) => void;
  onCalibrationComplete?: (calibration: CalibrationData) => void;
  onCalibrationFailed?: (reason: string) => void;
}

const CALIBRATION_STORAGE_KEY = "ggw.calibration.v1";

function isCalibrationData(value: unknown): value is CalibrationData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const point = (p: unknown) => p === null || (typeof p === "object" && p !== null &&
    finite((p as Record<string, unknown>).x) && finite((p as Record<string, unknown>).y) &&
    finite((p as Record<string, unknown>).z));
  const corridor = v.strumCorridor as Record<string, unknown> | null | undefined;
  return (
    v.version === 1 && v.motionPoint === "knuckles" && typeof v.calibratedAt === "string" &&
    finite(v.handScale) && v.handScale > 0 && v.handScale <= 2 &&
    finite(v.noiseFloor) && v.noiseFloor >= 0 &&
    finite(v.sensitivity) && v.sensitivity >= 0.25 && v.sensitivity <= 3 &&
    point(v.chordHandNeutral) && point(v.performanceHandNeutral) &&
    typeof corridor === "object" && corridor !== null && corridor !== undefined &&
    finite(corridor.topY) && finite(corridor.bottomY) && finite(corridor.neutralY) &&
    corridor.topY >= 0 && corridor.bottomY <= 1 &&
    corridor.topY < corridor.neutralY && corridor.neutralY < corridor.bottomY
  );
}

/** Load a persisted calibration, or null when absent/invalid. */
export function loadStoredCalibration(storage: KeyValueAdapter = new LocalStorageAdapter()): CalibrationData | null {
  const parsed = storage.get<unknown>(CALIBRATION_STORAGE_KEY);
  return isCalibrationData(parsed) ? parsed : null;
}

export function storeCalibration(
  calibration: CalibrationData,
  storage: KeyValueAdapter = new LocalStorageAdapter(),
): void {
  storage.set(CALIBRATION_STORAGE_KEY, calibration);
}

/**
 * Owns the camera-side realtime stack: VisionClient (camera + worker pump)
 * feeding VisionPipeline (gesture/motion → bus events). Runs entirely
 * outside React; the UI polls stats and the latest frame for the overlay.
 */
export class VisionSession {
  readonly pipeline: VisionPipeline;

  private readonly options: VisionSessionOptions;
  private client: VisionClient | null = null;
  private latestFrame: VisionFrame | null = null;
  private state: VisionSessionState = "idle";
  private lastError: VisionClientError | null = null;

  constructor(options: VisionSessionOptions) {
    this.options = options;
    this.pipeline = new VisionPipeline(options.bus, {
      handedness: options.handedness,
      resolveSlotChord: options.resolveSlotChord,
      isRecording: options.isRecording,
      onCalibrationComplete: (calibration) => {
        storeCalibration(calibration);
        options.onCalibrationComplete?.(calibration);
      },
      onCalibrationFailed: (reason) => options.onCalibrationFailed?.(reason),
    });
    const stored = loadStoredCalibration();
    if (stored) {
      this.pipeline.setCalibration(stored);
    }
    this.pipeline.setEnabled(false);
  }

  get currentState(): VisionSessionState {
    return this.state;
  }

  /** The failure that put the session into "error" state, when known. */
  get visionError(): VisionClientError | null {
    return this.lastError;
  }

  get isRunning(): boolean {
    return this.state === "running";
  }

  /** Latest raw frame for the landmark overlay (polled by CameraView rAF). */
  get frame(): VisionFrame | null {
    return this.latestFrame;
  }

  setHandedness(handedness: Handedness): void {
    this.pipeline.setHandedness(handedness);
  }

  setPreview(el: HTMLVideoElement | null): void {
    this.client?.setPreview(el);
  }

  private setState(state: VisionSessionState): void {
    this.state = state;
    this.options.onStateChange?.(state);
  }

  /** Start camera + worker + pipeline. videoEl displays the mirrored feed. */
  async start(videoEl: HTMLVideoElement): Promise<void> {
    if (this.client) return;
    this.lastError = null;
    this.setState("starting");
    const client = new VisionClient({
      adaptive: this.options.adaptive ?? true,
      onFrame: (frame) => {
        if (this.client !== client) return;
        this.latestFrame = frame;
        this.pipeline.handleFrame(frame);
      },
      onError: (error) => {
        if (this.client !== client) return;
        this.lastError = error;
        this.options.onError?.(error);
        if (this.state !== "running") this.setState("error");
      },
      onTierChange: (tier) => this.options.onTierChange?.(tier),
    });
    this.client = client; // stop() must also own an in-flight startup.
    try {
      await client.start(videoEl);
    } catch (err) {
      if (this.client !== client) return;
      this.client = null;
      this.lastError ??= {
        kind: "unsupported",
        message: err instanceof Error ? err.message : String(err),
      };
      this.setState("error");
      return;
    }
    if (this.client !== client) return;
    this.setState("running");
  }

  stop(): void {
    this.client?.stop();
    this.client = null;
    this.latestFrame = null;
    this.pipeline.reset();
    this.setState("stopped");
  }

  getStats(): {
    fps: number;
    avgInferenceMs: number;
    delegate: "GPU" | "CPU" | null;
    tier: VisionTier["id"];
    benchmark: { gpuMs: number | null; cpuMs: number | null } | null;
  } {
    return (
      this.client?.getStats() ?? {
        fps: 0,
        avgInferenceMs: 0,
        delegate: null,
        tier: "low",
        benchmark: null,
      }
    );
  }

  getDebugStats(): PipelineDebugStats {
    return this.pipeline.getDebugStats();
  }
}
