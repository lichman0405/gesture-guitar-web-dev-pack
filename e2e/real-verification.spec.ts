import { test, expect } from "@playwright/test";

/**
 * REAL-verification suite — no mocks of the thing being verified:
 *
 * 1. Audio: a strum must produce actual non-silent samples in the real
 *    Web Audio graph of a real browser (measured with an AnalyserNode),
 *    not just events on a bus.
 * 2. Export: recording must render real WAV files via the real
 *    OfflineAudioContext — decoded back and checked for non-silence.
 * 3. Vision: the real 7.8 MB MediaPipe model + WASM + worker + camera
 *    pipeline must initialize and run inference (fps/inference stats).
 *    The fake camera shows no hands, so calibration must fail gracefully
 *    with a "no hands" style reason — never a model/camera error.
 */

/** Minimal structural types for the dev introspection hook. */
interface GgwController {
  audioGraph: { ctx: AudioContext; master: AudioNode };
  exportArtifactUrls: Map<string, string>;
}
interface GgwVision {
  currentState: string;
  getStats: () => {
    fps: number;
    avgInferenceMs: number;
    delegate: "GPU" | "CPU" | null;
    tier: string;
    benchmark: { gpuMs: number | null; cpuMs: number | null } | null;
  };
}

declare global {
  interface Window {
    __ggw?: {
      controller: () => GgwController;
      vision: () => GgwVision;
    };
    __analyser?: AnalyserNode;
  }
}

test.describe("Real audio rendering (no fakes)", () => {
  test("a strum produces actual audible samples in the real Web Audio graph", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("keyboard-mode-button").click();
    await expect(page.getByTestId("perform-screen")).toBeVisible();

    // Real AudioContext must be running after the user-gesture entry.
    const ctxState = await page.evaluate(() => {
      const c = window.__ggw!.controller();
      return c.audioGraph.ctx.state as string;
    });
    expect(ctxState).toBe("running");

    // Tap an analyser onto the master bus, then strum and measure.
    await page.evaluate(() => {
      const c = window.__ggw!.controller();
      const ctx: AudioContext = c.audioGraph.ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      c.audioGraph.master.connect(analyser);
      (window as Window).__analyser = analyser;
    });

    await page.keyboard.press("1"); // C chord
    await page.keyboard.press("ArrowDown"); // strum
    await page.waitForTimeout(300); // let the pluck ring into the graph

    const peak = await page.evaluate(() => {
      const analyser = window.__analyser!;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let max = 0;
      for (const v of data) max = Math.max(max, Math.abs(v));
      return max;
    });

    // A real pluck must be clearly non-silent.
    expect(peak).toBeGreaterThan(0.01);
  });
});

test.describe("Real export rendering (real OfflineAudioContext)", () => {
  test("recording yields decodable, non-silent guitar and mix WAVs", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("keyboard-mode-button").click();
    await expect(page.getByTestId("perform-screen")).toBeVisible();

    await page.keyboard.press("r");
    await expect(page.getByTestId("rec-indicator")).toBeVisible();
    await page.keyboard.press("1");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(400);
    await page.keyboard.press("5");
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(400);
    await page.keyboard.press("r"); // stop via keyboard

    await expect(page.getByTestId("results-screen")).toBeVisible({ timeout: 30000 });

    // In a REAL browser OfflineAudioContext exists: the guitar track must
    // render successfully — in jsdom unit tests this exact path fails over
    // to the isolated-failure branch, so success here is the real signal.
    await expect(page.getByTestId("export-guitar-wav")).toBeEnabled();
    await expect(page.getByTestId("export-mix-wav")).toBeEnabled();

    const wavStats = await page.evaluate(async () => {
      const c = window.__ggw!.controller();
      const ctx: AudioContext = c.audioGraph.ctx;
      const out: Record<string, { duration: number; rms: number }> = {};
      for (const [kind, url] of c.exportArtifactUrls as Map<string, string>) {
        if (!kind.endsWith("-wav")) continue;
        const raw = await (await fetch(url)).arrayBuffer();
        const audio = await ctx.decodeAudioData(raw);
        const ch = audio.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
        out[kind] = {
          duration: audio.duration,
          rms: Math.sqrt(sum / ch.length),
        };
      }
      return out;
    });

    // Guitar track: roughly the recorded span and clearly non-silent.
    expect(wavStats["guitar-wav"].duration).toBeGreaterThan(0.8);
    expect(wavStats["guitar-wav"].rms).toBeGreaterThan(1e-4);
    // Mix track exists and contains the guitar (vocal may be fake-mic tone).
    expect(wavStats["mix-wav"].duration).toBeGreaterThan(0.8);
    expect(wavStats["mix-wav"].rms).toBeGreaterThan(1e-4);

    // performance.json must parse and contain the performed events.
    const jsonInfo = await page.evaluate(async () => {
      const c = window.__ggw!.controller();
      const url = (c.exportArtifactUrls as Map<string, string>).get("performance-json")!;
      const doc = JSON.parse(await (await fetch(url)).text());
      return {
        version: doc.version as number,
        eventCount: doc.events.length as number,
        types: [...new Set(doc.events.map((e: { type: string }) => e.type))] as string[],
      };
    });
    expect(jsonInfo.eventCount).toBeGreaterThanOrEqual(4);
    expect(jsonInfo.types).toContain("strum");
    expect(jsonInfo.types).toContain("chord");
  });
});

test.describe("Real vision stack (real model + WASM + worker + camera)", () => {
  test("loads the real MediaPipe model, runs inference, fails calibration gracefully", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto("/");
    await page.getByTestId("start-button").click();
    await page.getByTestId("continue-button").click();

    // Calibration starts once camera + worker + model are all live.
    // Reaching "正在校准…" proves the REAL 7.8 MB model loaded and the
    // inference loop runs — a model/worker failure lands on camera-error.
    await expect(page.getByText("正在校准…")).toBeVisible({ timeout: 60000 });

    // Real inference round-trips: wait until frames actually flow, then
    // assert measured inference cost is real and sane.
    await expect
      .poll(
        () => page.evaluate(() => window.__ggw!.vision().getStats().fps as number),
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);

    const stats = await page.evaluate(() => {
      const s = window.__ggw!.vision().getStats();
      return {
        fps: s.fps as number,
        inferenceMs: s.avgInferenceMs as number,
        delegate: s.delegate as "GPU" | "CPU" | null,
        benchmark: s.benchmark,
      };
    });
    expect(stats.inferenceMs).toBeGreaterThan(0);
    // Real inference is happening (headless CI uses SwiftShader software GL,
    // so per-frame cost can be hundreds of ms; on real GPU hardware this is
    // typically tens of ms and the adaptive tier keeps the pump responsive).
    expect(stats.inferenceMs).toBeLessThan(2000);
    // The startup delegate benchmark must have picked a working delegate
    // (in headless SwiftShader this is usually CPU — exactly what the
    // benchmark is for).
    expect(stats.delegate).not.toBeNull();
    expect(stats.benchmark).not.toBeNull();

    // The fake camera shows no hands → calibration must fail with a
    // hands-related reason, and the fallback path must work.
    await expect(page.locator(".calibrate-failed")).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".calibrate-failed p[role='alert']")).not.toContainText(
      /无法启动摄像头/,
    );

    await page.getByText("切换到键盘演奏").click();
    await expect(page.getByTestId("perform-screen")).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
