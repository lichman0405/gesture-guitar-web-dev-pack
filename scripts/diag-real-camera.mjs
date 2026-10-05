// Real-camera diagnostic: headed Chromium (real GPU), real webcam, no fakes.
// Measures fps / inferenceMs / tier over ~12 s against the dev server.
// Run: node scripts/diag-real-camera.mjs [baseUrl]
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] ?? "http://localhost:5173";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ permissions: ["camera"] });
const page = await context.newPage();

await page.addInitScript(() => {
  const OrigWorker = window.Worker;
  window.Worker = class extends OrigWorker {
    constructor(url, opts) {
      super(url, opts);
      this.addEventListener("message", (e) => {
        if (e.data && (e.data.type === "error" || e.data.type === "ready")) {
          console.log("[worker-msg]", JSON.stringify(e.data));
        }
      });
    }
  };
});
page.on("console", (msg) => {
  if (msg.type() !== "debug") console.log(`[console:${msg.type()}]`, msg.text());
});
page.on("pageerror", (err) => console.log(`[pageerror]`, String(err)));

await page.goto(`${baseUrl}/`);
await page.getByTestId("start-button").click();
await page.getByTestId("continue-button").click();

// Wait for the vision session to be running (calibration screen visible).
await page.waitForFunction(
  () => window.__ggw?.vision?.()?.currentState === "running",
  { timeout: 30000 },
);
console.log("[state] running");

for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(2000);
  const sample = await page.evaluate(() => {
    const v = window.__ggw.vision();
    const s = v.getStats();
    // Runtime access to private fields for diagnostics only.
    const tier = v.client?.getTier?.() ?? "?";
    return { ...s, tier };
  });
  console.log(
    `[sample ${i}] fps=${sample.fps} inferenceMs=${sample.avgInferenceMs.toFixed(1)} tier=${sample.tier}`,
  );
}

await browser.close();
