import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "Android phone", width: 412, height: 915 },
  { name: "Android tablet", width: 800, height: 1280 },
]) {
  test(`keeps Open World and encounter UI mutually exclusive on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto("/?aurion_preview=open-world");
    await expect(page.getByRole("heading", { name: /Aurion-Expanse/i })).toBeVisible();
    await expect(page.locator(".mission-ui")).toHaveCount(0);
    await expect(page.getByText(/ARENA 1\/4/i)).toHaveCount(0);
    await expect(page.getByText(/LLM COMPANION/i)).toHaveCount(0);
    await expect(page.getByText(/LIVE COMMAND BRIDGE/i)).toHaveCount(0);
    await expect(page.locator(".open-world-card")).toHaveCount(0);

    await page.getByRole("button", { name: "WELT / QUESTS" }).click();
    const details = page.locator(".open-world-card");
    await expect(details).toBeVisible();
    await expect(page.locator(".mission-ui")).toHaveCount(0);
    await page.getByRole("button", { name: "WELTDETAILS SCHLIESSEN" }).click();
    await expect(details).toHaveCount(0);

    await page.goto("/?aurion_preview=loadout");
    await expect(page.getByRole("heading", { name: /Setze den Resonanzkurs/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "IN DIE OPEN WORLD" })).toBeVisible();
    await expect(page.getByRole("button", { name: "STERNWARTE BETRETEN" })).toHaveCount(0);
    await expect(page.locator(".mission-ui")).toHaveCount(0);
    await expect(page.getByText(/SENTINEL/i)).toHaveCount(0);
  });
}
