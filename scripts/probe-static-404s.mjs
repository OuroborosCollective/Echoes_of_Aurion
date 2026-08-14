import { chromium } from "@playwright/test";

const baseUrl = process.env.AURION_E2E_BASE_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
const missing = [];
page.on("response", response => {
  if (response.status() === 404) missing.push(response.url());
});
await page.goto(baseUrl, { waitUntil: "networkidle" });
console.log(JSON.stringify([...new Set(missing)], null, 2));
await browser.close();
