import { test, expect } from "@playwright/test";

test("ten minutes of debug-mode vision, audio and repeated recording remain healthy", async ({ page }) => {
  test.skip(process.env.GGW_SOAK !== "1", "Run npm run test:soak for the full wall-clock check");
  test.setTimeout(720_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("crash", () => errors.push("page crashed"));
  await page.addInitScript(() => {
    window.__mediaTracks = [];
    window.__analyserInputs = new Set();
    const request = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await request(constraints);
      window.__mediaTracks.push(...stream.getTracks());
      return stream;
    };
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
  await page.getByTestId("start-button").click();
  await page.getByTestId("continue-button").click();
  await expect(page.getByText("使用默认参数继续")).toBeVisible({ timeout: 60_000 });
  await page.getByText("使用默认参数继续").click();
  const started = Date.now();
  let cycles = 0;
  while (Date.now() - started < 600_000) {
    await page.getByTestId("display-mode-debug").click();
    await expect.poll(async () => Number(await page.getByTestId("debug-fps").textContent())).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__analyserInputs.size)).toBe(1);
    await page.keyboard.press(cycles % 2 === 0 ? "1" : "5");
    await page.getByTestId("record-button").click();
    await expect(page.getByTestId("mic-status")).toContainText("正在录制麦克风");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(1000);
    await page.keyboard.press("ArrowUp");
    await page.getByTestId("stop-record-button").click();
    await expect(page.getByTestId("export-vocal-wav")).toBeEnabled();
    await expect(page.getByTestId("export-guitar-wav")).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.__analyserInputs.size)).toBe(0);
    expect(await page.evaluate(() => window.__mediaTracks.filter((t) => t.kind === "audio")
      .every((t) => t.readyState === "ended"))).toBe(true);
    await page.getByTestId("re-record-button").click();
    await page.getByTestId("display-mode-debug").click();
    for (let stroke = 0; stroke < 15 && Date.now() - started < 600_000; stroke++) {
      await page.keyboard.press(stroke % 2 ? "ArrowUp" : "ArrowDown");
      await page.waitForTimeout(2000);
    }
    cycles++;
    console.log(`[soak] ${Math.floor((Date.now() - started) / 1000)}s; ${cycles} recordings; errors=${errors.length}`);
    expect(errors).toEqual([]);
  }
  await page.getByText("结束演奏", { exact: true }).click();
  await expect(page.getByTestId("keyboard-mode-button")).toBeVisible();
  expect(Date.now() - started).toBeGreaterThanOrEqual(600_000);
  expect(cycles).toBeGreaterThan(10);
  expect(await page.evaluate(() => window.__mediaTracks.every((t) => t.readyState === "ended"))).toBe(true);
  expect(await page.evaluate(() => window.__analyserInputs.size)).toBe(0);
  expect(errors).toEqual([]);
});
