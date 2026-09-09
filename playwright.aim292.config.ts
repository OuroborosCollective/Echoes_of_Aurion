import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./e2e",testMatch:["aim292.npcMemory.spec.ts"],timeout:240_000,workers:1,retries:0,
  reporter:[["list"],["html",{outputFolder:"playwright-aim292-report",open:"never"}]],
  use:{baseURL:"http://127.0.0.1:3000",browserName:"chromium",headless:true,
    launchOptions:{args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-dev-shm-usage"]},screenshot:"only-on-failure",trace:"retain-on-failure"},
});
