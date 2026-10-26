import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New design" })).toBeVisible({ timeout: 60_000 });
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

  const opener = page.getByRole("button", { name: "New design" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "New design" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(":focus")).toHaveAttribute("aria-label", "Cancel");

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Save" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveAttribute("aria-label", "Cancel");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
