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
import type { AppSettings } from "../storage/settingsStore";
import { AppStore } from "./state/appStore";

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
};

export interface PerformanceControllerOptions {
  /** Injectable engine factory for tests (defaults to procedural engine on the real graph). */
  createEngine?: (ctx: AudioContext) => GuitarEngine;
  onSessionRecorded?: (session: RecordedSession) => void;
  onBeat?: (info: { bar: number; beatInBar: number; accent: string; audioTime: number }) => void;
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

  startMetronome(): void {
    if (!this.graph || !this.settings || this.transport?.running) return;
    const grid = new BeatGrid(
      this.settings.bpm,
      this.settings.timeSignature,
      this.settings.countInBars,
    );
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
      this.options.onBeat?.(info);
    });
    this.transport.start();
    this.store.set({ metronomeRunning: true });
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
    this.store.set({ recording: true, recordStartWallTime: Date.now() });
  }

  stopRecording(): RecordedSession | null {
    const session = this.recorder.stop();
    this.store.set({ recording: false, recordStartWallTime: null });
    if (session) this.options.onSessionRecorded?.(session);
    return session;
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
        this.transport?.stop();
        this.store.set({ metronomeRunning: false });
        break;
      case "resume":
      case "ready":
        break;
      case "recalibrate":
        break;
    }
  }

  dispose(): void {
    this.stopMetronome();
    this.engine?.stopAll();
    this.unsubscribeBus?.();
    this.unsubscribeBus = null;
    void this.graph?.dispose();
    this.graph = null;
    this.engine = null;
  }
}
