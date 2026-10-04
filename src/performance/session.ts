import type { EventBus } from "./eventBus";
import type { PerformanceEvent, SessionSettings } from "./eventTypes";
import { PERFORMANCE_JSON_VERSION } from "./eventTypes";

export interface RecordedSession {
  version: string;
  sessionId: string;
  startedAt: string;
  settings: SessionSettings;
  events: PerformanceEvent[];
  songPlan?: object | null;
  evaluation?: object | null;
}

export function generateSessionId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `session-${rand}`;
}

/**
 * Captures bus events into a deterministic session log. Event `t` values are
 * re-based to seconds-since-record-start at stop() time so exports always
 * satisfy schemas/performance.schema.json (t >= 0).
 */
export class SessionRecorder {
  private unsubscribe: (() => void) | null = null;
  private events: PerformanceEvent[] = [];
  private startClockTime = 0;
  private settings: SessionSettings | null = null;
  private sessionId = "";
  private startedAt = "";

  constructor(private readonly bus: EventBus) {}

  get isRecording(): boolean {
    return this.unsubscribe !== null;
  }

  start(settings: SessionSettings, sessionId: string = generateSessionId()): void {
    this.stopDiscard();
    this.settings = settings;
    this.sessionId = sessionId;
    this.startedAt = new Date().toISOString();
    this.startClockTime = this.bus.now();
    this.events = [];
    this.unsubscribe = this.bus.subscribe((event) => {
      this.events.push(event);
    });
  }

  /** Stops and returns the recorded session, or null if not recording. */
  stop(): RecordedSession | null {
    if (!this.unsubscribe || !this.settings) return null;
    this.unsubscribe();
    this.unsubscribe = null;

    const events = this.events
      .map((event) => ({ ...event, t: Math.max(0, event.t - this.startClockTime) }))
      .sort((a, b) => a.t - b.t);

    const session: RecordedSession = {
      version: PERFORMANCE_JSON_VERSION,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      settings: this.settings,
      events,
    };
    this.events = [];
    return session;
  }

  /** Stops without returning data (used when restarting). */
  private stopDiscard(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.events = [];
  }
}
