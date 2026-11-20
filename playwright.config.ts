import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const macChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const localChromePath = process.platform === "darwin" && existsSync(macChromePath) ? macChromePath : undefined;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  // Headless WebGL and the CAD WASM kernel compete for CPU on hosted runners.
  workers: process.env.CI ? 1 : 2,
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    launchOptions: localChromePath ? { executablePath: localChromePath } : undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet-touch", use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: "mobile-touch", use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: { KERCAD_BROWSER_TEST: "1", KERCAD_CANONICAL_HOST: "off", KERCAD_METRICS_DIR: "apps/web/.next-browser-test/metrics" },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
