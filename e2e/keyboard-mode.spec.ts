import { test, expect } from "@playwright/test";

/**
 * Acceptance B — mandatory deterministic E2E path (no camera):
 * keyboard simulation drives chord/strum/mute/intensity through the real app.
 */
test.describe("Keyboard simulation mode (acceptance B)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("keyboard-mode-button").click();
    await expect(page.getByTestId("perform-screen")).toBeVisible();
  });

  test("chord slots, strum directions, mute and accent are wired end to end", async ({
    page,
  }) => {
    const chord = page.getByTestId("current-chord");
    const direction = page.getByTestId("strum-direction");

    // Slot 1 in default key C (scale mode) → C major.
    await page.keyboard.press("1");
    await expect(chord).toHaveText("C");

    // Down strum.
    await page.keyboard.press("ArrowDown");
    await expect(direction).toHaveText("▼");
    await expect(page.locator(".strum-intensity")).toContainText("normal");

    // Slot 5 → G major, up strum.
    await page.keyboard.press("5");
    await expect(chord).toHaveText("G");
    await page.keyboard.press("ArrowUp");
    await expect(direction).toHaveText("▲");

    // Mute toggle → damped articulation.
    await page.keyboard.press("Space");
    await expect(page.locator(".mute-badge")).toHaveText("MUTED");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".strum-intensity")).toContainText("muted");
    await page.keyboard.press("Space");
    await expect(page.locator(".mute-badge")).toHaveCount(0);

    // Accent intensity (Shift+strum).
    await page.keyboard.press("Shift+ArrowDown");
    await expect(page.locator(".strum-intensity")).toContainText("accent");

    // Soft intensity (Ctrl+strum).
    await page.keyboard.press("Control+ArrowDown");
    await expect(page.locator(".strum-intensity")).toContainText("soft");
  });

  test("explicit chord keys and minor modifier work", async ({ page }) => {
    const chord = page.getByTestId("current-chord");
    await page.keyboard.press("a");
    await expect(chord).toHaveText("A");
    await page.keyboard.press("Shift+a");
    await expect(chord).toHaveText("Am");
  });

  test("record stop exports the session and lands on results", async ({ page }) => {
    await page.keyboard.press("r");
    await expect(page.getByTestId("rec-indicator")).toBeVisible();

    // Perform something so the session has events.
    await page.keyboard.press("1");
    await page.keyboard.press("ArrowDown");

    await page.getByTestId("stop-record-button").click();

    // Stopping a recording runs the local export, then shows results.
    await expect(page.getByTestId("results-screen")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("export-performance-json")).toBeVisible();

    // Re-record returns to the perform screen ready for another take.
    await page.getByTestId("re-record-button").click();
    await expect(page.getByTestId("perform-screen")).toBeVisible();
    await expect(page.getByTestId("record-button")).toBeVisible();
  });

  test("metronome starts and shows beat pulse", async ({ page }) => {
    await page.getByTestId("metronome-button").click();
    await expect(page.getByTestId("beat-dot")).not.toHaveClass(/off/, { timeout: 5000 });
  });
});
