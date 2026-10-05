/**
 * Tiny observable store for summarized UI state (ARCHITECTURE.md §3:
 * React owns summarized display state; realtime state lives outside).
 * React reads via useSyncExternalStore; high-rate producers (vision,
 * metronome) write at their own cadence — snapshots are immutable and cheap.
 */

export type Listener = () => void;

export class AppStore<T extends object> {
  private state: T;
  private listeners = new Set<Listener>();

  constructor(initial: T) {
    this.state = initial;
  }

  getSnapshot(): T {
    return this.state;
  }

  set(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  replace(next: T): void {
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
