import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: ["aim290.rendererRecovery.spec.ts"],
  timeout: 240_000, workers: 1, retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-aim290-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000", browserName: "chromium", headless: false,
    launchOptions: { args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1920,1080",
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan",
      "--use-angle=vulkan",
      "--use-vulkan=swiftshader",
      "--use-webgpu-adapter=swiftshader",
      "--disable-vulkan-surface"
    ] },
    screenshot: "only-on-failure", trace: "retain-on-failure",
  },
});
