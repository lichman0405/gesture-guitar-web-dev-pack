import { test, expect } from "@playwright/test";

// Browser flow: new slots persist and can be played in development or production.
test("ten custom gesture chords persist and all new keyboard slots work", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByLabel("Chord mapping", { exact: true }).selectOption("custom");
  for (const [slot, chord] of [[7, "Bm"], [8, "F#m"], [9, "C#"], [10, "G#m"]] as const) {
    await page.getByLabel(new RegExp(`^Slot ${slot} ·`)).selectOption(chord);
  }
  await page.reload();
  await page.getByTestId("start-button").click();
  for (const [slot, chord] of [[7, "Bm"], [8, "F#m"], [9, "C#"], [10, "G#m"]] as const) {
    await expect(page.getByLabel(new RegExp(`^Slot ${slot} ·`))).toHaveValue(chord);
  }
  await page.getByText("Play with keyboard", { exact: true }).click();
  for (const [key, chord] of [["7", "Bm"], ["8", "F#m"], ["9", "C#"], ["0", "G#m"]] as const) {
    await page.keyboard.press(key);
    await expect(page.getByTestId("current-chord")).toHaveText(chord);
    await page.keyboard.press("ArrowDown");
  }
});

// Uses synthetic landmarks, real geometry/detectors, real audio and export.
// Camera/model inference is verified separately in real-verification.spec.ts.
test("all ten landmark poses and twenty alternating strokes reach real audio and recording", async ({ page }) => {
  test.skip(process.env.GGW_PREVIEW === "1", "Dev module imports are unavailable in a built preview.");
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");
  await page.getByTestId("keyboard-mode-button").click();
  await page.getByTestId("record-button").click();
  await expect(page.getByTestId("rec-indicator")).toBeVisible();
  const peak = await page.evaluate(async () => {
    const paths = ["/src/debug/syntheticLandmarks.ts", "/src/app/visionPipeline.ts", "/src/music/theory/keys.ts"];
    const { buildGestureHand } = await import(paths[0]) as typeof import("../src/debug/syntheticLandmarks");
    const { VisionPipeline } = await import(paths[1]) as typeof import("../src/app/visionPipeline");
    const { scaleModeMapping } = await import(paths[2]) as typeof import("../src/music/theory/keys");
    const controller = window.__ggw!.controller() as unknown as {
      bus: import("../src/performance/eventBus").EventBus;
      audioGraph: { ctx: AudioContext; master: AudioNode };
    };
    const analyser = controller.audioGraph.ctx.createAnalyser();
    analyser.fftSize = 4096;
    controller.audioGraph.master.connect(analyser);
    const mapping = scaleModeMapping("C");
    const pipeline = new VisionPipeline(controller.bus, { handedness: "right", resolveSlotChord: (slot) => mapping[slot] });
    const gestures = ["index", "index-middle", "index-middle-ring", "four-fingers", "open-palm", "thumbs-up", "pinky", "index-pinky", "thumb-index", "thumb-pinky"] as const;
    let t = 0, peak = 0;
    const samples = new Float32Array(analyser.fftSize);
    for (const gesture of gestures) {
      const ys = [...Array(8).fill(0.7) as number[], ...[1, 2, 3, 4, 5].map((i) => 0.7 + i * 0.026), ...[1, 2, 3, 4, 5].map((i) => 0.83 - i * 0.026)];
      for (const y of ys) {
        pipeline.handleFrame({ t, inferenceMs: 8, frameWidth: 640, frameHeight: 480, hands: [
          buildGestureHand(gesture, { physical: "Left", wrist: { x: 0.25, y: 0.65, z: 0 }, scale: 0.16 }),
          buildGestureHand("pick-grip", { physical: "Right", wrist: { x: 0.75, y, z: 0 }, scale: 0.16 }),
        ] });
        t += 1 / 30;
        await new Promise((resolve) => setTimeout(resolve, 34));
        analyser.getFloatTimeDomainData(samples);
        peak = Math.max(peak, ...samples.map(Math.abs));
      }
    }
    pipeline.reset();
    controller.audioGraph.master.disconnect(analyser);
    analyser.disconnect();
    return peak;
  });
  expect(peak).toBeGreaterThan(0.01);
  await expect(page.getByTestId("current-chord")).toHaveText("A#");
  await page.getByTestId("stop-record-button").click();
  await expect(page.getByTestId("results-screen")).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const controller = window.__ggw!.controller();
    const json = await (await fetch(controller.exportArtifactUrls.get("performance-json")!)).json();
    const events = json.events as import("../src/performance/eventTypes").PerformanceEvent[];
    return {
      slots: [...new Set(events.filter((e) => e.type === "chord").map((e) => e.type === "chord" ? e.slot : null))],
      directions: events.filter((e) => e.type === "strum").map((e) => e.type === "strum" ? e.direction : null),
      articulations: events.filter((e) => e.type === "strum").map((e) => e.type === "strum" ? e.articulation : null),
    };
  });
  expect(result.slots).toEqual(Array.from({ length: 10 }, (_, i) => `slot-${i + 1}`));
  expect(result.directions).toEqual(Array.from({ length: 20 }, (_, i) => i % 2 ? "up" : "down"));
  expect(result.articulations.every((value) => value === "normal")).toBe(true);
  await expect(page.getByTestId("export-guitar-wav")).toBeEnabled();
  expect(errors).toEqual([]);
});
