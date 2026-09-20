import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { createLinearPatternFeature, createPolarPatternFeature, createStarterDocument } from "../../apps/web/src/lib/parametricDocument";

// Find the dense yellow disc, not the thin yellow guide, in the rendered view.
async function yellowHandle(page: Page) {
  const viewport = await page.locator(".parametric-viewport").boundingBox();
  const sidebar = await page.locator(".educad-model-sidebar").boundingBox();
  const { data, info } = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const stride = info.width + 1;
  const sums = new Int32Array(stride * (info.height + 1));
  for (let y = 0; y < info.height; y++) {
    let row = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      row += data[i] > 200 && data[i + 1] > 120 && data[i + 1] < 215 && data[i + 2] < 110 ? 1 : 0;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  let best = { x: 0, y: 0, score: 0 };
  for (let y = Math.ceil(viewport!.y + 90); y < info.height - 30; y += 2) {
    for (let x = 120; x < (sidebar?.x ?? info.width) - 20; x += 2) {
      const score = sums[(y + 10) * stride + x + 10] - sums[(y - 10) * stride + x + 10] - sums[(y + 10) * stride + x - 10] + sums[(y - 10) * stride + x - 10];
      if (score > best.score) best = { x, y, score };
    }
  }
  expect(best.score).toBeGreaterThan(180);
  return best;
}

test("Pattern controls and yellow distance/angle handles update the model", async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(test.info().project.name !== "desktop", "Pixel-based drag checks use desktop coordinates.");
  const document = createStarterDocument();
  document.name = "Pattern controls";
  const linear = createLinearPatternFeature(1);
  linear.objectId = document.objects[0].id;
  linear.spacing = 30;
  linear.count = 3;
  const polar = createPolarPatternFeature(1);
  polar.objectId = document.objects[0].id;
  polar.count = 3;
  polar.angle = 180;
  document.features.push(linear, polar);
  await page.addInitScript((stored) => localStorage.setItem("educad.parametric.document.v1", JSON.stringify(stored)), document);
  await page.goto("/");
  await page.locator(".card-open").filter({ hasText: "Pattern controls" }).click();
  const idle = async () => {
    await expect(page.locator(".educad-background-process")).toHaveCount(0, { timeout: 90_000 });
    await expect(page.locator(".educad-rebuild-error")).toHaveCount(0);
  };
  await idle();
  const toolbar = page.locator(".educad-viewport-context-toolbar");
  const inspector = page.locator(".educad-sidebar-editor");
  await page.locator(".educad-operation-select").filter({ hasText: "Linear pattern 1" }).click();
  await toolbar.getByRole("textbox", { name: "Repetitions", exact: true }).fill("4");
  await toolbar.getByRole("textbox", { name: "Repetitions", exact: true }).press("Enter");
  await idle();
  const spacing = inspector.locator("label").filter({ has: page.getByText("Spacing", { exact: true }) }).locator("input").first();
  await expect(spacing).toHaveValue("30");
  let point = await yellowHandle(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 70, point.y - 25, { steps: 8 });
  await page.mouse.up();
  await expect(spacing).not.toHaveValue("30");
  await idle();
  await page.screenshot({ path: test.info().outputPath("linear-pattern.png") });

  await page.locator(".educad-operation-select").filter({ hasText: "Polar pattern 1" }).click();
  for (const axis of ["X", "Y", "Z"]) {
    await toolbar.getByRole("button", { name: `Axis ${axis}`, exact: true }).click();
    await expect(toolbar.getByRole("button", { name: `Axis ${axis}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await toolbar.getByRole("textbox", { name: "Repetitions", exact: true }).fill("5");
  await toolbar.getByRole("textbox", { name: "Repetitions", exact: true }).press("Enter");
  await toolbar.getByRole("combobox", { name: "Source", exact: true }).selectOption(document.features[1].id);
  await expect(inspector.locator("select").first()).toHaveValue(document.features[1].id);
  await idle();
  const angle = inspector.locator("label").filter({ has: page.getByText("Total angle", { exact: true }) }).locator("input").first();
  await expect(angle).toHaveValue("180");
  point = await yellowHandle(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 35, point.y - 65, { steps: 8 });
  await page.mouse.up();
  await expect(angle).not.toHaveValue("180");
  await idle();
  await page.screenshot({ path: test.info().outputPath("polar-pattern.png") });
});
