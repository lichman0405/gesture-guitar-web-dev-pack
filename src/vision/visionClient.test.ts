// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisionClient } from "./visionClient";
import type { VisionWorkerInMessage, VisionWorkerOutMessage } from "./types";

class TestWorker {
  onmessage: ((event: { data: VisionWorkerOutMessage }) => void) | null = null;
  onerror: ((error: { message: string }) => void) | null = null;
  terminate = vi.fn();
  detects = 0;
  static autoReady = true;
  static instances: TestWorker[] = [];
  constructor() { TestWorker.instances.push(this); }
  postMessage(message: VisionWorkerInMessage) {
    if (message.type === "init" && TestWorker.autoReady) {
      queueMicrotask(() => this.onmessage?.({ data: { type: "ready", delegate: "CPU",
        benchmark: { gpuMs: 100, cpuMs: 5 } } }));
    }
    if (message.type === "detect") { this.detects++; message.bitmap.close(); }
  }
}
let stopTrack: ReturnType<typeof vi.fn>;
let stream: MediaStream;
let draw: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  TestWorker.instances = [];
  TestWorker.autoReady = true;
  stopTrack = vi.fn();
  stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  draw = vi.fn();
  vi.stubGlobal("Worker", TestWorker);
  vi.stubGlobal("OffscreenCanvas", class {
    width: number; height: number;
    constructor(width: number, height: number) { this.width = width; this.height = height; }
    getContext() { return { drawImage: draw }; }
    transferToImageBitmap() { return { close: vi.fn() }; }
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("VisionClient resource ownership", () => {
  it("keeps inference independent of removed or replaced preview elements", async () => {
    const client = new VisionClient();
    const preview = document.createElement("video");
    await client.start(preview);
    client.setPreview(null);
    await vi.advanceTimersByTimeAsync(1);
    expect(draw).toHaveBeenCalled();
    expect(draw.mock.calls[0][0]).not.toBe(preview);
    expect(stopTrack).not.toHaveBeenCalled();
    const replacement = document.createElement("video");
    client.setPreview(replacement);
    expect(replacement.srcObject).toBe(stream);
    client.stop();
    expect(replacement.srcObject).toBeNull();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("retains the one-second watchdog for lost worker responses", async () => {
    const client = new VisionClient();
    await client.start(document.createElement("video"));
    await vi.advanceTimersByTimeAsync(1);
    const worker = TestWorker.instances[0];
    expect(worker.detects).toBe(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(worker.detects).toBe(2);
    client.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(worker.detects).toBe(2);
  });

  it("continues the frame pump after an explicit inference error response", async () => {
    const client = new VisionClient();
    await client.start(document.createElement("video"));
    await vi.advanceTimersByTimeAsync(1);
    const worker = TestWorker.instances[0];
    worker.onmessage?.({ data: { type: "error", message: "one bad frame" } });
    await vi.advanceTimersByTimeAsync(51);
    expect(worker.detects).toBe(2);
    client.stop();
  });

  it("cancels initialization immediately and releases the camera", async () => {
    TestWorker.autoReady = false;
    const client = new VisionClient();
    const starting = client.start(document.createElement("video"));
    const rejected = expect(starting).rejects.toThrow("cancelled");
    await vi.advanceTimersByTimeAsync(1);
    client.stop();
    await rejected;
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(TestWorker.instances).toHaveLength(1);
  });
});
