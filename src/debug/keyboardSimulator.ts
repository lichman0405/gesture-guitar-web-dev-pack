import type {
  Articulation,
  ChordEvent,
  ControlAction,
  ControlEvent,
  EventSource,
  MuteEvent,
  StrumDirection,
  StrumEvent,
} from "../performance/eventTypes";
import type { EventBus } from "../performance/eventBus";

export interface KeyboardSimulatorOptions {
  /** Map a slot id to a chord symbol; return null/undefined to suppress the event. */
  resolveSlot?: (slotId: string) => string | null;
  /** Event source override (default "keyboard"). */
  source?: EventSource;
  /**
   * Source of truth for recording state. When provided, the record toggle key
   * derives record-start/record-stop from this instead of an internal flag, so
   * mixing keyboard and UI record controls stays consistent.
   */
  isRecording?: () => boolean;
}

/**
 * Debug keyboard input path for the gesture guitar.
 *
 * Attaches to a Window and translates key presses into performance events
 * published on the supplied EventBus.
 */
export class KeyboardSimulator {
  private readonly bus: EventBus;
  private readonly options: Required<Pick<KeyboardSimulatorOptions, "source">> &
    Pick<KeyboardSimulatorOptions, "resolveSlot" | "isRecording">;
  private _muteActive = false;
  private _isRecording = false;
  private _isPaused = false;
  private _isAttached = false;
  private target: Window | null = null;
  private readonly boundHandler: (e: KeyboardEvent) => void;

  constructor(bus: EventBus, options?: KeyboardSimulatorOptions) {
    this.bus = bus;
    this.options = {
      source: options?.source ?? "keyboard",
      resolveSlot: options?.resolveSlot,
      isRecording: options?.isRecording,
    };
    this.boundHandler = this.handleKeyDown.bind(this);
  }

  /** Whether the mute toggle is currently active. */
  get muteActive(): boolean {
    return this._muteActive;
  }

  /** Whether recording is currently toggled on. */
  get isRecording(): boolean {
    return this._isRecording;
  }

  /** Whether pause is currently toggled on. */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /** Whether the simulator is currently attached to a window. */
  get isAttached(): boolean {
    return this._isAttached;
  }

  /** Attach keydown listener to the given window. Idempotent. */
  attach(target: Window): void {
    if (this._isAttached) return;
    this.target = target;
    this.target.addEventListener("keydown", this.boundHandler);
    this._isAttached = true;
  }

  /** Detach keydown listener. Idempotent. */
  detach(): void {
    if (!this._isAttached || !this.target) return;
    this.target.removeEventListener("keydown", this.boundHandler);
    this.target = null;
    this._isAttached = false;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (isInputTarget(e.target)) return;

    const handled = this.processKey(e);
    if (handled) {
      e.preventDefault();
    }
  }

  private processKey(e: KeyboardEvent): boolean {
    const t = this.bus.now();
    const source = this.options.source;

    const digitMatch = /^Digit([1-6])$/.exec(e.code);
    if (digitMatch) {
      const slotId = `slot-${digitMatch[1]}`;
      const chord = this.options.resolveSlot?.(slotId);
      if (chord == null) return false;
      const event: ChordEvent = {
        type: "chord",
        t,
        slot: slotId,
        chord,
        confidence: 1,
        source,
      };
      this.bus.publish(event);
      return true;
    }

    const explicitChordMap: Record<string, string> = {
      KeyC: "C",
      KeyD: "D",
      KeyE: "E",
      KeyF: "F",
      KeyG: "G",
      KeyA: "A",
      KeyB: "B",
    };
    if (explicitChordMap[e.code]) {
      let chord = explicitChordMap[e.code];
      if (e.shiftKey) chord += "m";
      const event: ChordEvent = {
        type: "chord",
        t,
        chord,
        confidence: 1,
        source,
      };
      this.bus.publish(event);
      return true;
    }

    if (e.code === "ArrowDown" || e.code === "ArrowUp") {
      const direction: StrumDirection = e.code === "ArrowDown" ? "down" : "up";
      let velocity: number;
      let intensity: number;
      if (e.shiftKey) {
        velocity = 1.6;
        intensity = 0.9;
      } else if (e.ctrlKey) {
        velocity = 0.5;
        intensity = 0.25;
      } else {
        velocity = 1.0;
        intensity = 0.55;
      }
      const articulation: Articulation = this._muteActive ? "muted" : "normal";
      const event: StrumEvent = {
        type: "strum",
        t,
        direction,
        velocity,
        intensity,
        articulation,
        source,
      };
      this.bus.publish(event);
      return true;
    }

    if (e.code === "Space") {
      this._muteActive = !this._muteActive;
      const event: MuteEvent = {
        type: "mute",
        t,
        active: this._muteActive,
        source,
      };
      this.bus.publish(event);
      return true;
    }

    if (e.code === "KeyR") {
      const current = this.options.isRecording?.() ?? this._isRecording;
      this._isRecording = !current;
      const action: ControlAction = this._isRecording ? "record-start" : "record-stop";
      const event: ControlEvent = {
        type: "control",
        t,
        action,
        source,
      };
      this.bus.publish(event);
      return true;
    }

    if (e.code === "KeyP") {
      this._isPaused = !this._isPaused;
      const action: ControlAction = this._isPaused ? "pause" : "resume";
      const event: ControlEvent = {
        type: "control",
        t,
        action,
        source,
      };
      this.bus.publish(event);
      return true;
    }

    if (e.code === "Escape") {
      const event: ControlEvent = {
        type: "control",
        t,
        action: "stop",
        source,
      };
      this.bus.publish(event);
      return true;
    }

    return false;
  }
}

function isInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return target.isContentEditable;
}
