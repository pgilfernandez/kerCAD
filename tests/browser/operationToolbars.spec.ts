import { expect, test } from "@playwright/test";
import { operationToolbarDocument } from "../fixtures/operationToolbarDocument";

test("Shell and Boolean controls work in both operation panels", async ({ page }) => {
  test.setTimeout(180_000);
  const document = operationToolbarDocument();
  await page.addInitScript((stored) => localStorage.setItem("educad.parametric.document.v1", JSON.stringify(stored)), document);
  await page.goto("/");
  await page.locator(".card-open").filter({ hasText: "Operation controls" }).click();
  await expect(page.locator(".educad-background-process")).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator(".educad-rebuild-error")).toHaveCount(0);
  const toolbar = page.locator(".educad-viewport-context-toolbar");
  const inspector = page.locator(".educad-sidebar-editor");
  await page.locator(".educad-operation-select").filter({ hasText: "Shell 1" }).click();
  await expect(toolbar.getByRole("button", { name: "Rounded corners", exact: true })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Sharp corners", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Sharp corners", exact: true })).toHaveAttribute("aria-pressed", "true");
  await inspector.getByRole("button", { name: "Rounded corners", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Rounded corners", exact: true })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Edit faces", exact: true }).click();
  await toolbar.getByRole("button", { name: "Sharp corners", exact: true }).click();
  await toolbar.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Rounded corners", exact: true })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Edit faces", exact: true }).click();
  await toolbar.getByRole("button", { name: "Sharp corners", exact: true }).click();
  await toolbar.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Sharp corners", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".educad-background-process")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".educad-rebuild-error")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("shell-controls.png") });

  await page.locator(".educad-operation-select").filter({ hasText: /boolean/i }).click();
  await expect(toolbar.getByRole("button")).toHaveCount(3);
  await toolbar.getByRole("button", { name: "Hole", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Hole", exact: true })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("combobox", { name: "Object", exact: true }).selectOption(document.objects[2].id);
  await expect(inspector.getByRole("combobox")).toHaveValue(document.objects[2].id);
  await expect(inspector.getByText("Transform", { exact: true })).toHaveCount(0);
  await expect(toolbar.locator("option")).toHaveCount(2);
  const expectCentered = async () => {
    const measurements = await page.evaluate(() => {
      const viewport = window.document.querySelector(".parametric-viewport")!.getBoundingClientRect();
      const bar = window.document.querySelector(".educad-viewport-context-toolbar")!.getBoundingClientRect();
      const sidebar = window.document.querySelector(".educad-model-sidebar")?.getBoundingClientRect();
      return { actual: bar.x + bar.width / 2, expected: viewport.x + (viewport.width - (sidebar?.width ?? 0)) / 2 };
    });
    expect(Math.abs(measurements.actual - measurements.expected)).toBeLessThan(1);
  };
  await expectCentered();
  await page.getByRole("button", { name: "Simplify hierarchy", exact: true }).click();
  await expectCentered();
  await page.getByRole("button", { name: "Hide hierarchy", exact: true }).click();
  await expectCentered();
  await page.getByRole("button", { name: "Show hierarchy", exact: true }).click();
  await expectCentered();
  await expect(page.locator(".educad-background-process")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".educad-rebuild-error")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("boolean-controls.png") });
});
