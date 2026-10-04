import type { PerformanceEvent } from "./eventTypes";

export type PerformanceEventListener = (event: PerformanceEvent) => void;

export interface Clock {
  /** Seconds on the session clock. */
  now(): number;
}

/** Default clock: monotonic seconds, origin at first use. */
export function createPerformanceClock(): Clock {
  const origin = performance.now();
  return { now: () => (performance.now() - origin) / 1000 };
}

/**
 * Synchronous in-process bus for performance events.
 *
 * Realtime-safe: listeners are invoked synchronously in publish order, so
 * audio scheduling can happen in the same task as the triggering event.
 * UI code must subscribe through a rate-limited snapshot mechanism instead
 * of re-rendering per event.
 */
export class EventBus {
  private listeners = new Set<PerformanceEventListener>();
  private readonly clock: Clock;

  constructor(clock: Clock = createPerformanceClock()) {
    this.clock = clock;
  }

  now(): number {
    return this.clock.now();
  }

  publish(event: PerformanceEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  subscribe(listener: PerformanceEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
