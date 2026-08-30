import { expect, test } from "@playwright/test";

const homePreview = "/?aurion_preview=tower-home";

for (const viewport of [
  { name: "Android phone", width: 412, height: 915 },
  { name: "Android tablet", width: 800, height: 1280 },
]) {
  test(`keeps the complete tower-home gameplay flow visible on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(homePreview);

    const panel = page.locator(".tower-home-panel");
    await expect(page.getByRole("heading", { name: /Willkommen zurück/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ruhe finden" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Items lagern" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zimmer einrichten" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Besuch einladen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "LOADOUT VORBEREITEN" })).toBeVisible();
    await expect(page.getByRole("button", { name: "IN DIE OPEN WORLD" })).toBeVisible();

    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.x).toBeGreaterThanOrEqual(0);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: `test-results/tower-home-${viewport.width}x${viewport.height}.png`, fullPage: true });

    const communityToggle = page.getByRole("button", { name: /GEMEINSCHAFT|MENÜ SCHLIESSEN/i });
    await communityToggle.click();
    await page.getByRole("button", { name: "Forum öffnen" }).click();
    const closeCommunity = page.getByRole("button", { name: "Community-Konsole schließen" });
    await expect(closeCommunity).toBeVisible();
    const closeBox = await closeCommunity.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(closeBox!.width).toBeGreaterThanOrEqual(44);
    expect(closeBox!.height).toBeGreaterThanOrEqual(44);
    await closeCommunity.click();
    await expect(page.locator(".community-panel")).toHaveCount(0);
  });
}
