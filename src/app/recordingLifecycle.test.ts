// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceController } from "./performanceController";
import { DEFAULT_SETTINGS } from "../storage/settingsStore";
import { FakeAudioContext } from "../test/fakeAudioContext";
import { requestMicrophone, MicCapture } from "../recording/micCapture";
import { exportSession } from "../recording/sessionExporter";

vi.mock("../recording/micCapture", () => ({
  requestMicrophone: vi.fn(),
  MicCapture: vi.fn(function () {
    return { start: vi.fn().mockResolvedValue(undefined), dispose: vi.fn(), isCapturing: true,
      stop: vi.fn(() => ({ samples: new Float32Array(100), sampleRate: 48000, startOffsetSeconds: 0 })) };
  }),
}));
vi.mock("../recording/sessionExporter", () => ({ exportSession: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
async function createController(onResultsReady = vi.fn()) {
  vi.stubGlobal("AudioContext", vi.fn(() => new FakeAudioContext()));
  const controller = new PerformanceController({ onResultsReady });
  await controller.startAudio({ ...DEFAULT_SETTINGS });
  return controller;
}
const makeStream = () => {
  const stop = vi.fn();
  return { stop, stream: { getTracks: () => [{ stop }] } as unknown as MediaStream };
};

describe("recording lifecycle races", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestMicrophone).mockResolvedValue({ stream: null, error: "denied" });
    vi.mocked(exportSession).mockImplementation(async (session) => ({ session, artifacts: [], failures: [] }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("releases permission results arriving after stop", async () => {
    const pending = deferred<Awaited<ReturnType<typeof requestMicrophone>>>();
    vi.mocked(requestMicrophone).mockReturnValueOnce(pending.promise);
    const controller = await createController();
    controller.startRecording();
    controller.stopRecording();
    const { stream, stop } = makeStream();
    pending.resolve({ stream, error: null });
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(MicCapture).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("disposes capture if exiting during worklet initialization", async () => {
    const init = deferred<void>();
    const dispose = vi.fn();
    const { stream, stop } = makeStream();
    vi.mocked(requestMicrophone).mockResolvedValueOnce({ stream, error: null });
    vi.mocked(MicCapture).mockImplementationOnce(function () {
      return { start: () => init.promise, dispose } as unknown as MicCapture;
    });
    const controller = await createController();
    controller.startRecording();
    await vi.waitFor(() => expect(MicCapture).toHaveBeenCalledOnce());
    controller.dispose();
    expect(stop).toHaveBeenCalled();
    init.resolve();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(controller.recorder.isRecording).toBe(false);
  });

  it("duplicate record-start preserves the current take", async () => {
    const controller = await createController();
    controller.startRecording();
    controller.bus.publish({ type: "chord", t: controller.bus.now(), chord: "G", confidence: 1, source: "keyboard" });
    controller.startRecording();
    const session = controller.stopRecording();
    expect(session?.events).toHaveLength(1);
    expect(requestMicrophone).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("captures a chord and mute selected before recording", async () => {
    const controller = await createController();
    controller.bus.publish({ type: "chord", t: controller.bus.now(), chord: "G", confidence: 1, source: "vision" });
    controller.bus.publish({ type: "mute", t: controller.bus.now(), active: true, source: "vision" });
    controller.startRecording();
    const session = controller.stopRecording();
    expect(session?.events.map((event) => event.type)).toEqual(["chord", "mute"]);
    expect(session?.events[0]).toMatchObject({ chord: "G", source: "vision" });
    controller.dispose();
  });

  it("finishing an export after exit cannot navigate or create object URLs", async () => {
    const pending = deferred<Awaited<ReturnType<typeof exportSession>>>();
    vi.mocked(exportSession).mockReturnValueOnce(pending.promise);
    const onResultsReady = vi.fn();
    const controller = await createController(onResultsReady);
    controller.startRecording();
    const session = controller.stopRecording()!;
    controller.dispose();
    pending.resolve({ session, artifacts: [{ kind: "performance-json", filename: "take.json", blob: new Blob() }], failures: [] });
    await pending.promise;
    await Promise.resolve();
    expect(onResultsReady).not.toHaveBeenCalled();
    expect(controller.exportArtifactUrls.size).toBe(0);
  });
});
