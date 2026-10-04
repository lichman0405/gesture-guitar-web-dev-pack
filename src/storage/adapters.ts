/**
 * Simple key-value storage adapters with JSON serialization.
 */

/** JSON-serializing key-value adapter. */
export interface KeyValueAdapter {
  /** Retrieve and parse a JSON value by key. */
  get<T>(key: string): T | null;
  /** Serialize and store a value by key. */
  set<T>(key: string, value: T): void;
  /** Remove a key. */
  remove(key: string): void;
}

/** Map-backed in-memory adapter. */
export class MemoryAdapter implements KeyValueAdapter {
  private store = new Map<string, string>();

  get<T>(key: string): T | null {
    const raw = this.store.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, JSON.stringify(value));
  }

  remove(key: string): void {
    this.store.delete(key);
  }
}

/** localStorage-backed adapter with automatic in-memory fallback on errors. */
export class LocalStorageAdapter implements KeyValueAdapter {
  private fallback = new MemoryAdapter();

  constructor(private storage: Storage | null = null) {}

  get<T>(key: string): T | null {
    try {
      const s = this.storage ?? globalThis.localStorage;
      const raw = s.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return this.fallback.get<T>(key);
    }
  }

  set<T>(key: string, value: T): void {
    try {
      const s = this.storage ?? globalThis.localStorage;
      s.setItem(key, JSON.stringify(value));
    } catch {
      this.fallback.set(key, value);
    }
  }

  remove(key: string): void {
    try {
      const s = this.storage ?? globalThis.localStorage;
      s.removeItem(key);
    } catch {
      this.fallback.remove(key);
    }
  }
}
