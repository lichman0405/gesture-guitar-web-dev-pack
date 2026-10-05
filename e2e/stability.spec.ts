import { test, expect } from "@playwright/test";

/**
 * Acceptance N — stability: repeated record start/stop cycles and session
 * re-entry must not break the app (leak/crash proxy). The opt-in full
 * wall-clock check lives in soak.spec.ts (npm run test:soak).
 */
test.describe("Stability (acceptance N)", () => {
  test("repeated record/stop/re-record cycles stay healthy", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await page.getByTestId("keyboard-mode-button").click();
    await expect(page.getByTestId("perform-screen")).toBeVisible();

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    for (let cycle = 0; cycle < 5; cycle++) {
      await page.keyboard.press("r");
      await expect(page.getByTestId("rec-indicator")).toBeVisible();
      await page.keyboard.press("1");
      await page.keyboard.press("ArrowDown");
      await page.getByTestId("stop-record-button").click();
      await expect(page.getByTestId("results-screen")).toBeVisible({ timeout: 20000 });
      await expect(page.getByTestId("export-performance-json")).toBeVisible();
      await page.getByTestId("re-record-button").click();
      await expect(page.getByTestId("record-button")).toBeVisible();
    }

    expect(pageErrors).toEqual([]);
  });

  test("exit session and re-enter keyboard mode works repeatedly", async ({ page }) => {
    await page.goto("/");

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    for (let cycle = 0; cycle < 3; cycle++) {
      await page.getByTestId("keyboard-mode-button").click();
      await expect(page.getByTestId("perform-screen")).toBeVisible();
      await page.keyboard.press("1");
      await expect(page.getByTestId("current-chord")).toHaveText("C");
      await page.keyboard.press("ArrowDown");
      await page.getByText("结束演奏").click();
      await expect(page.getByTestId("keyboard-mode-button")).toBeVisible();
    }

    expect(pageErrors).toEqual([]);
  });
});
