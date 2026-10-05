import type {
  ChordEvent,
  ControlEvent,
  MuteEvent,
  PerformanceEvent,
  SessionSettings,
  StrumEvent,
} from "../performance/eventTypes";
import { EventBus } from "../performance/eventBus";
import { SessionRecorder } from "../performance/session";
import type { RecordedSession } from "../performance/session";
import { AudioGraph } from "../audio/graph";
import { ProceduralGuitarEngine } from "../music/engine/ProceduralGuitarEngine";
import type { GuitarEngine } from "../music/engine/GuitarEngine";
import { BeatGrid } from "../music/timing/beatGrid";
import { Transport } from "../music/timing/transport";
import { Metronome } from "../music/timing/metronome";
import { scaleModeMapping, normalizeChordSymbol } from "../music/theory";
import { MicCapture, requestMicrophone } from "../recording/micCapture";
import { exportSession } from "../recording/sessionExporter";
import type { VocalCapture } from "../recording/types";
import type { GuidedPlan, EvaluationResult } from "../guided/types";
import { buildExpectedEvents } from "../guided/expectedEvents";
import { evaluateSession } from "../guided/evaluator";
import { getPatternForMeter } from "../guided/patterns";
import type { AppSettings } from "../storage/settingsStore";
import { AppStore } from "./state/appStore";

export interface GuidedUiState {
  expectedChord: string | null;
  nextChord: string | null;
  nextStrum: { direction: "down" | "up"; beatInBar: number } | null;
  bar: number;
  totalBars: number;
}

export interface ResultsSummary {
  sessionId: string;
  artifacts: { kind: string; filename: string }[];
  failures: { kind: string; message: string }[];
  evaluation: EvaluationResult | null;
}

export interface UiState {
  audioReady: boolean;
  chord: string | null;
  chordSlot: string | null;
  lastStrum: { direction: "down" | "up"; intensity: number; articulation: string } | null;
  muteActive: boolean;
  recording: boolean;
  recordStartWallTime: number | null;
  metronomeRunning: boolean;
  beatPulse: { bar: number; beatInBar: number; accent: string; inCountIn: boolean; seq: number } | null;
  lastControl: string | null;
  guided: GuidedUiState | null;
  micError: string | null;
  micStatus: "idle" | "requesting" | "recording" | "unavailable";
  exportState: "idle" | "exporting" | "done" | "failed";
  results: ResultsSummary | null;
}

const INITIAL_UI_STATE: UiState = {
  audioReady: false,
  chord: null,
  chordSlot: null,
  lastStrum: null,
  muteActive: false,
  recording: false,
  recordStartWallTime: null,
  metronomeRunning: false,
  beatPulse: null,
  lastControl: null,
  guided: null,
  micError: null,
  micStatus: "idle",
  exportState: "idle",
  results: null,
};

export interface PerformanceControllerOptions {
  /** Injectable engine factory for tests (defaults to procedural engine on the real graph). */
  createEngine?: (ctx: AudioContext) => GuitarEngine;
  onSessionRecorded?: (session: RecordedSession) => void;
  onBeat?: (info: { bar: number; beatInBar: number; accent: string; audioTime: number }) => void;
  /** Fired when an export finished and results are ready to display. */
  onResultsReady?: () => void;
}

/**
 * Wiring hub: performance bus events → guitar engine / metronome / session
 * recorder, and summarized state → UI store. Vision and keyboard paths both
 * publish onto the same bus, so this controller is input-source agnostic.
 */
export class PerformanceController {
  readonly bus = new EventBus();
  readonly store = new AppStore<UiState>(INITIAL_UI_STATE);
  readonly recorder = new SessionRecorder(this.bus);

  private readonly options: PerformanceControllerOptions;
  private graph: AudioGraph | null = null;
  private engine: GuitarEngine | null = null;
  private transport: Transport | null = null;
  private metronome: Metronome | null = null;
  private unsubscribeBus: (() => void) | null = null;
  private settings: AppSettings | null = null;
  private grid: BeatGrid | null = null;
  private recordingGrid: BeatGrid | null = null;
  private guidedPlan: GuidedPlan | null = null;
  private micCapture: MicCapture | null = null;
  private micStream: MediaStream | null = null;
  private exportUrls = new Map<string, string>();
  private wasRunningBeforePause = false;
  private micGeneration = 0;
  private micStartOffset = 0;
  private disposed = false;
  private lastChordEvent: ChordEvent | null = null;
  private lastMuteEvent: MuteEvent | null = null;

  constructor(options: PerformanceControllerOptions = {}) {
    this.options = options;
    this.unsubscribeBus = this.bus.subscribe((event) => this.handleEvent(event));
  }

  get isAudioReady(): boolean {
    return this.engine !== null;
  }

  get guitarEngine(): GuitarEngine | null {
    return this.engine;
  }

  get audioGraph(): AudioGraph | null {
    return this.graph;
  }

  /**
   * Must be called from a user gesture. Creates the audio graph + engine,
   * connects the engine to the guitar bus, prepares buffers.
   */
  async startAudio(settings: AppSettings): Promise<void> {
    this.settings = settings;
    if (!this.graph) {
      this.graph = new AudioGraph();
    }
    const ctx = this.graph.ctx;
    await this.graph.ensureRunning();
    if (!this.engine) {
      this.engine = this.options.createEngine
        ? this.options.createEngine(ctx)
        : new ProceduralGuitarEngine(ctx);
      this.engine.connect(this.graph.guitarBus);
      this.engine.setPreset(settings.instrumentPreset);
      await this.engine.prepare();
    }
    this.applyGuidedFromSettings(settings);
    this.store.set({ audioReady: true });
  }

  /** Resolve a slot id to a (normalized) chord symbol using current settings. */
  resolveSlot(slotId: string): string | null {
    if (!this.settings) return null;
    let mapped: string | null = null;
    if (this.settings.chordMappingMode === "custom") {
      mapped = this.settings.customMapping[slotId] ?? null;
    } else if (this.settings.key) {
      mapped = scaleModeMapping(this.settings.key)[slotId] ?? null;
    }
    if (!mapped) return null;
    try {
      return normalizeChordSymbol(mapped);
    } catch {
      return mapped;
    }
  }

  updateSettings(settings: AppSettings): void {
    const prev = this.settings;
    this.settings = settings;
    if (this.engine && prev?.instrumentPreset !== settings.instrumentPreset) {
      this.engine.setPreset(settings.instrumentPreset);
    }
    this.applyGuidedFromSettings(settings);
    // Restart transport if musical params changed while running.
    if (
      this.transport?.running &&
      prev &&
      (prev.bpm !== settings.bpm || prev.timeSignature !== settings.timeSignature)
    ) {
      this.stopMetronome();
      this.startMetronome();
    }
  }

  /** Build/refresh the guided plan from current settings (mode-driven). */
  private applyGuidedFromSettings(settings: AppSettings): void {
    if (settings.mode === "guided") {
      const pattern = getPatternForMeter(settings.guidedPatternId, settings.timeSignature);
      this.setGuidedPlan(pattern ? { pattern, progression: { bars: [] } } : null);
    } else if (settings.mode === "song") {
      const pattern =
        getPatternForMeter(settings.guidedPatternId, settings.timeSignature) ??
        getPatternForMeter("down-beats", settings.timeSignature);
      const bars = settings.songProgression.map((chord) => ({ chord }));
      this.setGuidedPlan(pattern && bars.length > 0 ? { pattern, progression: { bars } } : null);
    } else {
      this.setGuidedPlan(null);
    }
  }

  setGuidedPlan(plan: GuidedPlan | null): void {
    this.guidedPlan = plan;
    if (!plan) {
      this.store.set({ guided: null });
    }
  }

  get currentGuidedPlan(): GuidedPlan | null {
    return this.guidedPlan;
  }

  /** Object URLs of the last export, keyed by artifact kind. */
  get exportArtifactUrls(): ReadonlyMap<string, string> {
    return this.exportUrls;
  }

  startMetronome(): void {
    if (!this.graph || !this.settings || this.transport?.running) return;
    const grid = new BeatGrid(
      this.settings.bpm,
      this.settings.timeSignature,
      this.settings.countInBars,
    );
    this.grid = grid;
    this.transport = new Transport(this.graph.ctx, grid);
    this.metronome = new Metronome(this.graph.ctx, this.graph.master, {
      audible: this.settings.metronomeOn,
    });
    this.metronome.attach(this.transport);
    this.transport.addBeatListener((info) => {
      this.store.set({
        beatPulse: {
          bar: info.bar,
          beatInBar: info.beatInBar,
          accent: info.accent,
          inCountIn: info.inCountIn,
          seq: info.beatIndex,
        },
      });
      this.updateGuidedState(info);
      this.options.onBeat?.(info);
    });
    this.transport.start();
    this.store.set({ metronomeRunning: true });
  }

  /** Recompute the guided/song display state at each beat boundary. */
  private updateGuidedState(info: { bar: number; beatInBar: number }): void {
    const plan = this.guidedPlan;
    if (!plan) return;
    const progLen = plan.progression.bars.length;
    const totalBars = plan.barCount ?? progLen;
    const bar = Math.max(0, info.bar);
    let expectedChord: string | null = null;
    let nextChord: string | null = null;
    if (progLen > 0) {
      expectedChord = plan.progression.bars[bar % progLen]?.chord ?? null;
      nextChord = plan.progression.bars[(bar + 1) % progLen]?.chord ?? null;
    }
    const steps = plan.pattern.steps;
    const nextStep = steps.find((s) => s.beatOffset > info.beatInBar + 1e-3) ?? steps[0] ?? null;
    this.store.set({
      guided: {
        expectedChord,
        nextChord,
        nextStrum: nextStep
          ? { direction: nextStep.direction, beatInBar: nextStep.beatOffset }
          : null,
        bar,
        totalBars,
      },
    });
  }

  stopMetronome(): void {
    this.transport?.stop();
    this.transport = null;
    this.metronome?.detach();
    this.metronome = null;
    this.store.set({ metronomeRunning: false, beatPulse: null });
  }

  setMetronomeAudible(audible: boolean): void {
    this.metronome?.setAudible(audible);
  }

  startRecording(settings?: SessionSettings): void {
    if (this.disposed || this.recorder.isRecording || this.store.getSnapshot().exportState === "exporting") return;
    const sessionSettings: SessionSettings =
      settings ??
      (this.settings
        ? {
            handedness: this.settings.handedness,
            mode: this.settings.mode,
            key: this.settings.key,
            bpm: this.settings.bpm,
            timeSignature: this.settings.timeSignature,
            instrumentPreset: this.settings.instrumentPreset,
            chordMappingMode: this.settings.chordMappingMode,
            customMapping: this.settings.customMapping,
          }
        : {
            handedness: "right",
            mode: "free",
            key: "C",
            bpm: 100,
            timeSignature: "4/4",
            instrumentPreset: "acoustic-steel",
            chordMappingMode: "scale",
          });
    this.recorder.start(sessionSettings);
    const startedAt = this.bus.now();
    // Snapshot the chord/mute already selected before pressing Record.
    if (this.lastChordEvent) this.bus.publish({ ...this.lastChordEvent, t: startedAt });
    if (this.lastMuteEvent?.active) this.bus.publish({ ...this.lastMuteEvent, t: startedAt });
    this.store.set({
      recording: true,
      recordStartWallTime: Date.now(),
      micError: null,
      micStatus: "requesting",
      exportState: "idle",
      results: null,
    });

    // Guided/song recordings align to the transport (count-in included).
    if (this.guidedPlan) {
      this.stopMetronome();
      this.startMetronome();
    }
    this.recordingGrid = this.transport?.grid ?? this.grid;

    // Vocal capture is best-effort: mic denial never blocks guitar (§L).
    void this.startMicCapture(startedAt, ++this.micGeneration);
  }

  private async startMicCapture(startedAt: number, generation: number): Promise<void> {
    const graph = this.graph;
    if (!graph) return;
    const isCurrent = () => !this.disposed && this.recorder.isRecording && this.micGeneration === generation;
    const { stream, error } = await requestMicrophone();
    if (!stream) {
      if (isCurrent()) {
        this.store.set({ micStatus: "unavailable", micError: error ?? "Microphone unavailable" });
      }
      return;
    }
    if (!isCurrent()) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.micStream = stream; // Own the track while the worklet is still loading.
    const capture = new MicCapture();
    try {
      await capture.start(graph.ctx, stream);
      if (!isCurrent()) {
        capture.dispose();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.micCapture = capture;
      this.micStartOffset = Math.max(0, this.bus.now() - startedAt);
      this.store.set({ micStatus: "recording" });
    } catch (err) {
      capture.dispose();
      stream.getTracks().forEach((t) => t.stop());
      if (isCurrent()) {
        this.micStream = null;
        this.store.set({
          micStatus: "unavailable",
          micError: err instanceof Error ? err.message : "Microphone capture failed",
        });
      }
    }
  }

  private stopMicCapture(): VocalCapture | null {
    ++this.micGeneration;
    const capture = this.micCapture;
    this.micCapture = null;
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (!capture || !capture.isCapturing) return null;
    return { ...capture.stop(), startOffsetSeconds: this.micStartOffset };
  }

  stopRecording(): RecordedSession | null {
    const session = this.recorder.stop();
    const vocal = this.stopMicCapture();
    this.store.set({ recording: false, recordStartWallTime: null, micStatus: "idle" });
    if (session) this.stopMetronome();
    if (session) {
      const evaluation = this.evaluateIfGuided(session);
      this.options.onSessionRecorded?.(session);
      void this.runExport(session, vocal, evaluation);
    }
    return session;
  }

  /** Attach songPlan + evaluation to the session when a guided plan is active. */
  private evaluateIfGuided(session: RecordedSession): EvaluationResult | null {
    const plan = this.guidedPlan;
    const grid = this.recordingGrid;
    if (!plan || !grid) return null;
    const lastT = session.events.length > 0 ? session.events[session.events.length - 1].t : 0;
    const barDuration = grid.beatDuration * grid.beatsPerBar;
    const barCount =
      plan.progression.bars.length > 0
        ? plan.progression.bars.length
        : Math.max(1, Math.ceil(lastT / barDuration));
    const expected = buildExpectedEvents({ ...plan, barCount }, grid);
    const evaluation = evaluateSession(expected, session.events);
    session.evaluation = evaluation as unknown as object;
    session.songPlan = {
      mode: this.settings?.mode ?? "free",
      pattern: plan.pattern.id,
      progression: plan.progression,
    };
    return evaluation;
  }

  private async runExport(
    session: RecordedSession,
    vocal: VocalCapture | null,
    evaluation: EvaluationResult | null,
  ): Promise<void> {
    this.store.set({ exportState: "exporting" });
    this.revokeExportUrls();
    try {
      const result = await exportSession(session, { vocal: vocal ?? undefined });
      if (this.disposed) return;
      if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        for (const artifact of result.artifacts) {
          this.exportUrls.set(artifact.kind, URL.createObjectURL(artifact.blob));
        }
      }
      this.store.set({
        exportState: "done",
        results: {
          sessionId: session.sessionId,
          artifacts: result.artifacts.map((a) => ({ kind: a.kind, filename: a.filename })),
          failures: result.failures.map((f) => ({ kind: f.kind, message: f.message })),
          evaluation,
        },
      });
      this.options.onResultsReady?.();
    } catch (err) {
      if (this.disposed) return;
      // exportSession isolates per-track failures; this is the catastrophic path.
      this.store.set({
        exportState: "failed",
        results: {
          sessionId: session.sessionId,
          artifacts: [],
          failures: [
            {
              kind: "mix-wav",
              message: err instanceof Error ? err.message : "Export failed unexpectedly",
            },
          ],
          evaluation,
        },
      });
    }
  }

  private revokeExportUrls(): void {
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      for (const url of this.exportUrls.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // already revoked
        }
      }
    }
    this.exportUrls.clear();
  }

  private handleEvent(event: PerformanceEvent): void {
    switch (event.type) {
      case "chord":
        this.handleChord(event);
        break;
      case "strum":
        this.handleStrum(event);
        break;
      case "mute":
        this.handleMute(event);
        break;
      case "control":
        this.handleControl(event);
        break;
    }
  }

  private handleChord(event: ChordEvent): void {
    this.lastChordEvent = event;
    this.engine?.setChord(event.chord);
    this.store.set({ chord: event.chord, chordSlot: event.slot ?? null });
  }

  private handleStrum(event: StrumEvent): void {
    this.engine?.strum(event);
    this.store.set({
      lastStrum: {
        direction: event.direction,
        intensity: event.intensity,
        articulation: event.articulation,
      },
    });
  }

  private handleMute(event: MuteEvent): void {
    this.lastMuteEvent = event;
    this.engine?.setMuted(event.active);
    this.store.set({ muteActive: event.active });
  }

  private handleControl(event: ControlEvent): void {
    this.store.set({ lastControl: event.action });
    switch (event.action) {
      case "record-start":
        this.startRecording();
        break;
      case "record-stop":
      case "stop":
        // Defer so the recorder (subscribed after this controller) receives
        // the record-stop event itself before we unsubscribe it.
        if (this.recorder.isRecording) {
          queueMicrotask(() => this.stopRecording());
        }
        break;
      case "pause":
        this.wasRunningBeforePause = this.transport?.running ?? false;
        this.transport?.stop();
        this.store.set({ metronomeRunning: false });
        break;
      case "resume":
        if (this.wasRunningBeforePause) {
          this.startMetronome();
        }
        break;
      case "ready":
        // Two thumbs up: count me in.
        this.startMetronome();
        break;
      case "recalibrate":
        break;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.recorder.stop();
    this.stopMetronome();
    this.stopMicCapture();
    this.revokeExportUrls();
    this.engine?.stopAll();
    this.unsubscribeBus?.();
    this.unsubscribeBus = null;
    void this.graph?.dispose();
    this.graph = null;
    this.engine = null;
  }
}
