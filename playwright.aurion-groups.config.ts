import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "aim259.groups.spec.ts", timeout: 120_000,
  workers: 1, retries: 0, maxFailures: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-groups-report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3000", browserName: "chromium", headless: true, screenshot: "only-on-failure", trace: "off" },
});
