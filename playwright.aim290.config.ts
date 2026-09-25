import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: ["aim290.rendererRecovery.spec.ts"],
  timeout: 240_000, workers: 1, retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-aim290-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000", browserName: "chromium", headless: true,
    launchOptions: { args: ["--use-angle=swiftshader", "--use-vulkan=swiftshader", "--enable-unsafe-swiftshader", "--enable-unsafe-webgpu", "--enable-features=Vulkan", "--disable-vulkan-surface", "--disable-dev-shm-usage"] },
    screenshot: "only-on-failure", trace: "retain-on-failure",
  },
});
