import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: process.env.AURION_E2E_BASE_URL ?? "http://127.0.0.1:3000",
    browserName: "chromium",
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
    },
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
