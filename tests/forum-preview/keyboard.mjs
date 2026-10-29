import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://127.0.0.1:4174/index.html");
  const thread = page.getByRole("button", { name: /Observatorium.*events.*angeheftet/i });
  await thread.waitFor();
  await page.keyboard.press("Tab");
  assert.equal(await thread.evaluate(el => document.activeElement === el), true, "thread is not first keyboard focus");
  assert.equal(await thread.evaluate(el => el.matches(":focus-visible")), true, "focus-visible state missing");
  assert.notEqual(await thread.evaluate(el => getComputedStyle(el).boxShadow), "none", "keyboard focus ring missing");
  assert.equal(await thread.getAttribute("aria-pressed"), "false");
  await page.keyboard.press("Enter");
  assert.equal(await thread.getAttribute("aria-pressed"), "true");
  assert.equal(await page.getByLabel("Titel").inputValue(), "Observatorium");
  console.log("PASS: Chromium keyboard focus, accessible name and selection (synthetic fixture)");
} finally { await browser.close(); }
