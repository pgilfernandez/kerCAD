import type { Page } from "@playwright/test";

/** Smoke tests start after onboarding unless a test explicitly exercises it. */
export async function openProjectDashboard(page: Page, project?: unknown) {
  await page.addInitScript((stored) => {
    localStorage.setItem("kercad.locale", "en");
    localStorage.setItem("kercad.dashboard-welcome.v1.confirmed", "true");
    localStorage.setItem("kercad.dashboard-getting-started.v1.dismissed", "true");
    localStorage.setItem("kercad.getting-started.v1.dismissed", "true");
    if (stored) localStorage.setItem("kercad.parametric.document.v1", JSON.stringify(stored));
  }, project ?? null);
  await page.goto("/");
}
