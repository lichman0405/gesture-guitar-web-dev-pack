import { expect, it, vi } from "vitest";
import { LevelMeter } from "./meters";

it("removes old analyser inputs across repeated meter mounts without disconnecting the master", () => {
  const master = {};
  const connections = new Set<unknown>([master]);
  const source = {
    connect: (node: unknown) => connections.add(node),
    disconnect: (node: unknown) => connections.delete(node),
  } as unknown as AudioNode;
  const ctx = { createAnalyser: () => ({ fftSize: 0, disconnect: vi.fn() }) } as unknown as BaseAudioContext;
  for (let take = 0; take < 20; take++) {
    const meter = new LevelMeter(ctx, source);
    expect(connections.size).toBe(2);
    meter.disconnect();
    expect([...connections]).toEqual([master]);
  }
});
