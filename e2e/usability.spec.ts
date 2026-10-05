import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

declare global {
  interface Window {
    __mediaTracks: MediaStreamTrack[];
    __releaseMedia?: () => void;
    __mediaRequested?: boolean;
    __analyserInputs: Set<AudioNode>;
  }
}

test("repeated takes do not accumulate analyser connections on the guitar bus", async ({ page }) => {
  await page.addInitScript(() => {
    window.__analyserInputs = new Set();
    const connect = AudioNode.prototype.connect;
    const disconnect = AudioNode.prototype.disconnect;
    AudioNode.prototype.connect = function (destination: AudioNode, ...args: number[]) {
      if (destination instanceof AnalyserNode) window.__analyserInputs.add(destination);
      return Reflect.apply(connect, this, [destination, ...args]);
    } as typeof AudioNode.prototype.connect;
    AudioNode.prototype.disconnect = function (...args: unknown[]) {
      if (args[0] instanceof AnalyserNode) window.__analyserInputs.delete(args[0]);
      return Reflect.apply(disconnect, this, args);
    };
  });
  await page.goto("/");
  await page.getByTestId("keyboard-mode-button").click();
  for (let take = 0; take < 5; take++) {
    await expect.poll(() => page.evaluate(() => window.__analyserInputs.size)).toBe(1);
    await page.getByTestId("record-button").click();
    await page.keyboard.press("ArrowDown");
    await page.getByTestId("stop-record-button").click();
    await expect(page.getByTestId("results-screen")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__analyserInputs.size)).toBe(0);
    await page.getByTestId("re-record-button").click();
  }
  await page.getByText("结束演奏", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__analyserInputs.size)).toBe(0);
});

async function observeMedia(page: Page, delay: "audio" | "video" | null = null) {
  await page.addInitScript((delay) => {
    window.__mediaTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      window.__mediaTracks.push(...stream.getTracks());
      if (delay && constraints[delay]) {
        window.__mediaRequested = true;
        await new Promise<void>((resolve) => { window.__releaseMedia = resolve; });
      }
      return stream;
    };
  }, delay);
}

async function enterCameraPerformance(page: Page) {
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("continue-button").click();
  await expect.poll(() => page.locator("video").evaluate((el: HTMLVideoElement) =>
    el.videoWidth > 0 && !el.paused && (el.srcObject as MediaStream)?.active === true),
    { timeout: 20_000 }).toBe(true);
  await expect(page.getByText("使用默认参数继续")).toBeVisible({ timeout: 60_000 });
  await page.getByText("使用默认参数继续").click();
  await expect(page.getByTestId("perform-screen")).toBeVisible();
}

test("settings accept typed chord spaces and enter configured keyboard mode", async ({ page }) => {
  await page.goto("/");
  await page.getByText("设置", { exact: true }).click();
  await page.locator("#mode").selectOption("song");
  await page.locator("#progression").fill("");
  await expect(page.getByTestId("continue-button")).toBeDisabled();
  await page.locator("#progression").pressSequentially("G C Am F");
  await expect(page.locator("#progression")).toHaveValue("G C Am F");
  await page.locator("#key").selectOption("G");
  await page.getByText("使用键盘演奏", { exact: true }).click();
  await page.keyboard.press("1");
  await expect(page.getByTestId("current-chord")).toHaveText("G");
});

test("camera preview and inference survive screen changes and release on exit", async ({ page }) => {
  test.setTimeout(90_000);
  await observeMedia(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enterCameraPerformance(page);
  const hasLivePreview = () => page.locator("video").evaluate((el: HTMLVideoElement) =>
    el.videoWidth > 0 && !el.paused && (el.srcObject as MediaStream)?.active === true);
  await expect.poll(hasLivePreview).toBe(true);
  await page.getByTestId("display-mode-performance").click();
  await expect(page.locator("video")).toHaveCount(0);
  await page.waitForTimeout(1500);
  await page.getByTestId("display-mode-debug").click();
  await expect.poll(hasLivePreview).toBe(true);
  await expect.poll(async () => Number(await page.getByTestId("debug-fps").textContent())).toBeGreaterThan(0);
  await page.keyboard.press("1");
  await page.getByTestId("record-button").click();
  await page.keyboard.press("ArrowDown");
  await page.getByTestId("stop-record-button").click();
  await expect(page.getByTestId("results-screen")).toBeVisible();
  await page.keyboard.press("r"); // Results must not start a hidden recording.
  await page.getByTestId("re-record-button").click();
  await expect(page.getByTestId("record-button")).toBeVisible();
  await expect.poll(hasLivePreview).toBe(true);
  await page.getByText("结束演奏", { exact: true }).click();
  expect(await page.evaluate(() => window.__mediaTracks.every((t) => t.readyState === "ended"))).toBe(true);
  expect(errors).toEqual([]);
});

test("cancelling pending camera startup releases a late permission result", async ({ page }) => {
  await observeMedia(page, "video");
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("continue-button").click();
  await expect.poll(() => page.evaluate(() => window.__mediaRequested)).toBe(true);
  await page.getByText("返回", { exact: true }).click();
  await page.evaluate(() => window.__releaseMedia?.());
  await expect.poll(() => page.evaluate(() => window.__mediaTracks.every((t) => t.readyState === "ended"))).toBe(true);
  await expect(page.getByTestId("continue-button")).toBeVisible();
});

test("stopping before microphone permission resolves releases its late track", async ({ page }) => {
  await observeMedia(page, "audio");
  await page.goto("/");
  await page.getByTestId("keyboard-mode-button").click();
  await page.getByTestId("record-button").click();
  await expect.poll(() => page.evaluate(() => window.__mediaRequested)).toBe(true);
  await page.getByTestId("stop-record-button").click();
  await page.evaluate(() => window.__releaseMedia?.());
  await expect.poll(() => page.evaluate(() => window.__mediaTracks.every((t) => t.readyState === "ended"))).toBe(true);
  await expect(page.getByTestId("results-screen")).toBeVisible();
});

test("voice WAV contains PCM and an already selected chord is preserved in export", async ({ page }) => {
  await observeMedia(page);
  await page.goto("/");
  await page.getByTestId("keyboard-mode-button").click();
  await page.keyboard.press("g");
  await page.getByTestId("record-button").click();
  await expect(page.getByTestId("mic-status")).toContainText("正在录制麦克风");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(1200);
  await page.getByTestId("stop-record-button").click();
  await expect(page.getByTestId("results-screen")).toBeVisible();
  const voiceDownload = page.waitForEvent("download");
  await page.getByTestId("export-vocal-wav").click();
  const voicePath = await (await voiceDownload).path();
  const voice = await readFile(voicePath!);
  expect(voice.toString("ascii", 0, 4)).toBe("RIFF");
  expect(voice.length).toBeGreaterThan(10_000);
  let peak = 0;
  for (let i = 44; i + 1 < voice.length; i += 2) peak = Math.max(peak, Math.abs(voice.readInt16LE(i)));
  expect(peak).toBeGreaterThan(100);
  const jsonDownload = page.waitForEvent("download");
  await page.getByTestId("export-performance-json").click();
  const jsonPath = await (await jsonDownload).path();
  const doc = JSON.parse(await readFile(jsonPath!, "utf8"));
  expect(doc.events[0]).toMatchObject({ type: "chord", chord: "G" });
  expect(await page.evaluate(() => window.__mediaTracks.every((t) => t.readyState === "ended"))).toBe(true);
});

test("camera and microphone denial leave keyboard guitar usable", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); };
  });
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("continue-button").click();
  await expect(page.getByRole("alert")).toContainText("摄像头权限被拒绝");
  await page.getByText("切换到键盘演奏").click();
  await page.keyboard.press("g");
  await page.getByTestId("record-button").click();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("alert")).toContainText("麦克风权限被拒绝");
  await page.getByTestId("stop-record-button").click();
  await expect(page.getByTestId("export-guitar-wav")).toBeEnabled();
  await expect(page.getByTestId("export-performance-json")).toBeEnabled();
});
