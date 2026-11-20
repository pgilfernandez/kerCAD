import { expect, test } from "@playwright/test";
import { openProjectDashboard } from "../fixtures/editorBrowserSession";

test.beforeEach(async ({ page }) => {
  await openProjectDashboard(page);
  await page.getByRole("button", { name: /Create new 3D design/ }).click({ timeout: 60_000 });
});

test("supports the core viewport and keyboard flow", async ({ page }) => {
  await expect(page.locator("main.kercad-reference-shell")).toBeVisible();
  await expect(page.locator(".parametric-viewport canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Add shape" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home view" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const opener = page.getByRole("button", { name: "Import", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Import design" });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(close).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Choose file" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
