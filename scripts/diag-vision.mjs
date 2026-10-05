// One-off diagnostic: why does the camera flow fail in headless Chromium?
// Run: node scripts/diag-vision.mjs [baseUrl]  (server must already be running)
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] ?? "http://localhost:5173";

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const context = await browser.newContext({ permissions: ["camera", "microphone"] });
const page = await context.newPage();

// Intercept worker messages (init errors are posted, not thrown to console).
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

page.on("console", (msg) => console.log(`[console:${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.log(`[pageerror]`, String(err)));
page.on("workercreated", (w) => console.log(`[worker created]`, w.url));
page.on("workerdestroyed", (w) => console.log(`[worker destroyed]`, w.url));
page.on("requestfailed", (r) => console.log(`[requestfailed]`, r.url(), r.failure()?.errorText));
page.on("response", (r) => {
  if (r.url().includes("mediapipe") || r.url().includes("models") || r.url().includes("worker")) {
    console.log(`[response ${r.status()}]`, r.url());
  }
});

await page.goto(`${baseUrl}/`);

// 1. Can the page get a camera at all?
const gum = await page.evaluate(async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const track = stream.getVideoTracks()[0];
    const info = { ok: true, label: track.label, settings: track.getSettings() };
    stream.getTracks().forEach((t) => t.stop());
    return info;
  } catch (err) {
    return { ok: false, name: err.name, message: err.message };
  }
});
console.log("[getUserMedia probe]", JSON.stringify(gum));

// 2. Walk the camera flow and see where it lands.
await page.getByTestId("start-button").click();
await page.getByTestId("continue-button").click();
await page.waitForTimeout(12000);

const state = await page.evaluate(() => {
  const v = window.__ggw?.vision?.();
  return {
    state: v?.currentState ?? null,
    stats: v?.getStats?.() ?? null,
    bodyText: document.body.innerText.slice(0, 400),
  };
});
console.log("[vision state]", JSON.stringify(state, null, 2));

await browser.close();
