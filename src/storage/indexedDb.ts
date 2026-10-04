/**
 * Session summary storage backed by IndexedDB with an in-memory fallback.
 */

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  mode: string;
  bpm: number;
  eventCount: number;
  durationSeconds: number;
}

export interface SessionStore {
  save(summary: SessionSummary): Promise<void>;
  list(): Promise<SessionSummary[]>;
  remove(sessionId: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = "gesture-guitar";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

class IndexedDbSessionStore implements SessionStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
        }
      };
    });

    return this.dbPromise;
  }

  async save(summary: SessionSummary): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(summary);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async list(): Promise<SessionSummary[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = (request.result as SessionSummary[]).sort((a, b) =>
          a.startedAt.localeCompare(b.startedAt),
        );
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async remove(sessionId: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(sessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

class MemorySessionStore implements SessionStore {
  private data = new Map<string, SessionSummary>();

  async save(summary: SessionSummary): Promise<void> {
    this.data.set(summary.sessionId, summary);
  }

  async list(): Promise<SessionSummary[]> {
    return Array.from(this.data.values()).sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );
  }

  async remove(sessionId: string): Promise<void> {
    this.data.delete(sessionId);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

/** Create a {@link SessionStore}, preferring IndexedDB when available. */
export function createSessionStore(): SessionStore {
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
    return new IndexedDbSessionStore();
  }
  return new MemorySessionStore();
}
