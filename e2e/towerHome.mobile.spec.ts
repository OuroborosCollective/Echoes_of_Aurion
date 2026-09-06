import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "Android phone", width: 412, height: 915 },
  { name: "Android tablet", width: 800, height: 1280 },
]) {
  test(`keeps the Aurion account/community portal usable on ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Dein Zugang zu Echoes of Aurion/i })).toBeVisible();
    const account = page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true });
    await expect(account).toBeVisible();
    const accountBox = await account.boundingBox();
    expect(accountBox).not.toBeNull();
    expect(accountBox!.width).toBeGreaterThanOrEqual(44);
    expect(accountBox!.height).toBeGreaterThanOrEqual(44);

    for (const name of ["Community", "Forum", "Events", "Asset-Katalog", "Anmelden"]) {
      const control = page.getByRole(name === "Community" ? "link" : "button", { name, exact: true });
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    }

    await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toHaveCount(0);
    await expect(page.getByText(/SPIELSTART VORBEREITEN|AX1 OPEN WORLD STARTEN|LOADOUT VORBEREITEN|IN DIE OPEN WORLD/i)).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`aurion-portal-${viewport.width}x${viewport.height}.png`), fullPage: true });
  });
}
