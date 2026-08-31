import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outputPath = path.resolve(process.argv[2] ?? "build/android-release/aurion-social-keyframe_5edc4882.png");
const baseUrl = (process.env.AURION_CAPTURE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
await mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/?aurion_preview=open-world`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Aurion-Expanse/i }).waitFor({ state: "visible" });
  await page.locator("canvas.game-canvas").waitFor({ state: "visible" });
  if (await page.locator(".mission-ui").count()) throw new Error("Legacy mission UI is visible in the Open World keyframe.");
  if (await page.getByText(/ARENA 1\/4/i).count()) throw new Error("Legacy arena is visible in the Open World keyframe.");
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      html, body { overflow: hidden !important; }
    `,
  });
  await page.waitForTimeout(750);
  await page.screenshot({ path: outputPath, type: "png", fullPage: false });
  console.log(`android_social_keyframe_captured path=${outputPath} viewport=1200x630 source=open-world-playwright`);
} finally {
  await browser.close();
}
