/**
 * Storage module tests (node environment — no real IndexedDB or localStorage).
 */

import { describe, expect, it } from "vitest";
import {
  MemoryAdapter,
  LocalStorageAdapter,
  type KeyValueAdapter,
} from "./adapters";
import {
  SettingsStore,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type AppSettings,
} from "./settingsStore";
import { createSessionStore, type SessionSummary } from "./indexedDb";

describe("MemoryAdapter", () => {
  it("round-trips primitive and object values", () => {
    const adapter = new MemoryAdapter();
    adapter.set("name", "Guitar");
    adapter.set("count", 42);
    adapter.set("config", { volume: 0.8, muted: true });

    expect(adapter.get<string>("name")).toBe("Guitar");
    expect(adapter.get<number>("count")).toBe(42);
    expect(adapter.get<{ volume: number; muted: boolean }>("config")).toEqual({
      volume: 0.8,
      muted: true,
    });
  });

  it("returns null for missing keys", () => {
    const adapter = new MemoryAdapter();
    expect(adapter.get("missing")).toBeNull();
  });

  it("removes keys", () => {
    const adapter = new MemoryAdapter();
    adapter.set("x", 1);
    adapter.remove("x");
    expect(adapter.get("x")).toBeNull();
  });
});

describe("LocalStorageAdapter", () => {
  it("falls back to memory when localStorage is undefined (node)", () => {
    const adapter = new LocalStorageAdapter();
    adapter.set("k", "v");
    expect(adapter.get("k")).toBe("v");
    adapter.remove("k");
    expect(adapter.get("k")).toBeNull();
  });

  it("uses injected Storage when provided", () => {
    const storage: Storage = {
      getItem: (key: string) => (key === "k" ? '"injected"' : null),
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    const adapter = new LocalStorageAdapter(storage);
    expect(adapter.get("k")).toBe("injected");
  });
});

describe("SettingsStore", () => {
  function makeStore(adapter?: KeyValueAdapter): SettingsStore {
    return new SettingsStore(adapter);
  }

  it("returns defaults when adapter is empty", () => {
    const store = makeStore(new MemoryAdapter());
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it("save/load roundtrip", () => {
    const adapter = new MemoryAdapter();
    const store = makeStore(adapter);
    const custom: AppSettings = {
      ...DEFAULT_SETTINGS,
      bpm: 120,
      mode: "guided",
    };
    store.save(custom);
    expect(store.load()).toEqual(custom);
  });

  it("update merges and persists", () => {
    const adapter = new MemoryAdapter();
    const store = makeStore(adapter);
    const next = store.update({ bpm: 140, handedness: "left" });
    expect(next.bpm).toBe(140);
    expect(next.handedness).toBe("left");
    expect(next.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(store.load()).toEqual(next);
  });

  it("reset removes and returns defaults", () => {
    const adapter = new MemoryAdapter();
    const store = makeStore(adapter);
    store.save({ ...DEFAULT_SETTINGS, bpm: 200 });
    expect(store.reset()).toEqual(DEFAULT_SETTINGS);
    expect(adapter.get(SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it("corrupt JSON string returns defaults", () => {
    const adapter = new MemoryAdapter();
    adapter.set(SETTINGS_STORAGE_KEY, "not json");
    const store = makeStore(adapter);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it("sanitizes invalid bpm on load", () => {
    const adapter = new MemoryAdapter();
    adapter.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, bpm: 999 });
    const store = makeStore(adapter);
    expect(store.load().bpm).toBe(240);
  });

  it("sanitizes invalid timeSignature on load", () => {
    const adapter = new MemoryAdapter();
    adapter.set(SETTINGS_STORAGE_KEY, {
      ...DEFAULT_SETTINGS,
      timeSignature: "7/8",
    });
    const store = makeStore(adapter);
    expect(store.load().timeSignature).toBe("4/4");
  });

  it("sanitizes invalid handedness on load", () => {
    const adapter = new MemoryAdapter();
    adapter.set(SETTINGS_STORAGE_KEY, {
      ...DEFAULT_SETTINGS,
      handedness: "both",
    } as unknown as AppSettings);
    const store = makeStore(adapter);
    expect(store.load().handedness).toBe("right");
  });

  it("sanitizes invalid mode on load", () => {
    const adapter = new MemoryAdapter();
    adapter.set(SETTINGS_STORAGE_KEY, {
      ...DEFAULT_SETTINGS,
      mode: "party",
    } as unknown as AppSettings);
    const store = makeStore(adapter);
    expect(store.load().mode).toBe("free");
  });

  it("sanitizes invalid chordMappingMode on load", () => {
    const adapter = new MemoryAdapter();
    adapter.set(SETTINGS_STORAGE_KEY, {
      ...DEFAULT_SETTINGS,
      chordMappingMode: "auto",
    } as unknown as AppSettings);
    const store = makeStore(adapter);
    expect(store.load().chordMappingMode).toBe("scale");
  });

  it("sanitizes invalid sensitivity on load", () => {
    const adapter = new MemoryAdapter();
    adapter.set(SETTINGS_STORAGE_KEY, {
      ...DEFAULT_SETTINGS,
      sensitivity: 10,
    });
    const store = makeStore(adapter);
    expect(store.load().sensitivity).toBe(3);
  });

  it("sanitizes invalid countInBars on load", () => {
    const adapter = new MemoryAdapter();
    adapter.set(SETTINGS_STORAGE_KEY, {
      ...DEFAULT_SETTINGS,
      countInBars: -3,
    });
    const store = makeStore(adapter);
    expect(store.load().countInBars).toBe(0);
  });
});

describe("createSessionStore (node fallback)", () => {
  async function getStore() {
    const store = createSessionStore();
    await store.clear();
    return store;
  }

  it("save and list roundtrip", async () => {
    const store = await getStore();
    const s1: SessionSummary = {
      sessionId: "a",
      startedAt: "2024-01-01T00:00:00Z",
      mode: "free",
      bpm: 100,
      eventCount: 5,
      durationSeconds: 30,
    };
    await store.save(s1);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(s1);
  });

  it("list is sorted by startedAt ascending", async () => {
    const store = await getStore();
    const s1: SessionSummary = {
      sessionId: "b",
      startedAt: "2024-01-02T00:00:00Z",
      mode: "guided",
      bpm: 120,
      eventCount: 3,
      durationSeconds: 20,
    };
    const s2: SessionSummary = {
      sessionId: "c",
      startedAt: "2024-01-01T00:00:00Z",
      mode: "free",
      bpm: 90,
      eventCount: 1,
      durationSeconds: 10,
    };
    await store.save(s1);
    await store.save(s2);
    const list = await store.list();
    expect(list.map((s) => s.sessionId)).toEqual(["c", "b"]);
  });

  it("remove deletes a session", async () => {
    const store = await getStore();
    const s1: SessionSummary = {
      sessionId: "d",
      startedAt: "2024-01-01T00:00:00Z",
      mode: "free",
      bpm: 100,
      eventCount: 0,
      durationSeconds: 0,
    };
    await store.save(s1);
    await store.remove("d");
    expect(await store.list()).toHaveLength(0);
  });

  it("clear removes all sessions", async () => {
    const store = await getStore();
    await store.save({
      sessionId: "e",
      startedAt: "2024-01-01T00:00:00Z",
      mode: "free",
      bpm: 100,
      eventCount: 0,
      durationSeconds: 0,
    });
    await store.save({
      sessionId: "f",
      startedAt: "2024-01-02T00:00:00Z",
      mode: "free",
      bpm: 100,
      eventCount: 0,
      durationSeconds: 0,
    });
    await store.clear();
    expect(await store.list()).toHaveLength(0);
  });
});

it("persists all ten custom slots while ignoring unsupported slot IDs", () => {
  const adapter = new MemoryAdapter();
  adapter.set(SETTINGS_STORAGE_KEY, { customMapping: { "slot-7": "Bm", "slot-8": "F#m", "slot-9": "Db", "slot-10": "G#m", "slot-11": "C" } });
  expect(new SettingsStore(adapter).load().customMapping).toEqual({ "slot-7": "Bm", "slot-8": "F#m", "slot-9": "C#", "slot-10": "G#m" });
});
