import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outputPath = path.resolve(process.argv[2] ?? "build/android-release/aurion-social-keyframe_5edc4882.png");
const baseUrl = (process.env.AURION_CAPTURE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
await mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: /Dein Zugang zu Echoes of Aurion/i }).waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).first().waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button", { name: "Forum", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button", { name: "Events", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button", { name: "GLB-Einreichung öffnen", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  if (await page.locator("canvas").count()) throw new Error("Aurion portal must not mount a gameplay canvas.");
  if (await page.getByText(/ARENA 1\/4|WELT \/ QUESTS|Aurion-Expanse/i).count()) throw new Error("Legacy gameplay chrome is visible on the Aurion portal.");
  if (await page.getByRole("button", { name: /Angriff|Auto-Angriff|Begegnungen/i }).count()) throw new Error("Gameplay controls are visible on the Aurion portal.");
  await page.addStyleTag({ content: `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } html, body { overflow: hidden !important; }` });
  await page.waitForTimeout(250);
  await page.screenshot({ path: outputPath, type: "png", fullPage: false });
  console.log(`android_social_keyframe_captured path=${outputPath} viewport=1200x630 source=aurion-portal-community readonly=true gameplayCanvas=false`);
} finally {
  await browser.close();
}
