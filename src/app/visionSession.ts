import { VisionClient } from "../vision/visionClient";
import type { VisionClientError } from "../vision/visionClient";
import type { VisionFrame, VisionTier } from "../vision/types";
import { VisionPipeline } from "./visionPipeline";
import type { PipelineDebugStats } from "./visionPipeline";
import type { EventBus } from "../performance/eventBus";
import type { Handedness } from "../performance/eventTypes";
import type { CalibrationData } from "../motion/calibrationTypes";
import { LocalStorageAdapter } from "../storage/adapters";

export type VisionSessionState = "idle" | "starting" | "running" | "error" | "stopped";

export interface VisionSessionOptions {
  bus: EventBus;
  handedness: Handedness;
  resolveSlotChord: (slotId: string) => string | null;
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
  return (
    typeof v.handScale === "number" &&
    v.handScale > 0 &&
    typeof v.noiseFloor === "number" &&
    typeof v.strumCorridor === "object" &&
    v.strumCorridor !== null
  );
}

/** Load a persisted calibration, or null when absent/invalid. */
export function loadStoredCalibration(storage = new LocalStorageAdapter()): CalibrationData | null {
  const parsed = storage.get<unknown>(CALIBRATION_STORAGE_KEY);
  return isCalibrationData(parsed) ? parsed : null;
}

export function storeCalibration(
  calibration: CalibrationData,
  storage = new LocalStorageAdapter(),
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

  constructor(options: VisionSessionOptions) {
    this.options = options;
    this.pipeline = new VisionPipeline(options.bus, {
      handedness: options.handedness,
      resolveSlotChord: options.resolveSlotChord,
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
  }

  get currentState(): VisionSessionState {
    return this.state;
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

  private setState(state: VisionSessionState): void {
    this.state = state;
    this.options.onStateChange?.(state);
  }

  /** Start camera + worker + pipeline. videoEl displays the mirrored feed. */
  async start(videoEl: HTMLVideoElement): Promise<void> {
    if (this.client) return;
    this.setState("starting");
    const client = new VisionClient({
      adaptive: this.options.adaptive ?? true,
      onFrame: (frame) => {
        this.latestFrame = frame;
        this.pipeline.handleFrame(frame);
      },
      onError: (error) => {
        this.options.onError?.(error);
        if (this.state !== "running") this.setState("error");
      },
      onTierChange: (tier) => this.options.onTierChange?.(tier),
    });
    try {
      await client.start(videoEl);
    } catch {
      this.client = null;
      this.setState("error");
      return;
    }
    this.client = client;
    this.setState("running");
  }

  stop(): void {
    this.client?.stop();
    this.client = null;
    this.latestFrame = null;
    this.pipeline.reset();
    this.setState("stopped");
  }

  getStats(): { fps: number; avgInferenceMs: number } {
    return this.client?.getStats() ?? { fps: 0, avgInferenceMs: 0 };
  }

  getDebugStats(): PipelineDebugStats {
    return this.pipeline.getDebugStats();
  }
}
