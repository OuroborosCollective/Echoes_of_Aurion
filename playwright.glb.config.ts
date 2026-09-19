import { defineConfig } from "@playwright/test";
import base from "./playwright.aurion-migration.config";

export default defineConfig({
  ...base,
  testMatch: /glb(?:Zip)?Import\.spec\.ts/,
  reporter: [["list"], ["html", { outputFolder: "playwright-glb-report", open: "never" }]],
  use: {
    ...base.use,
  }
});
