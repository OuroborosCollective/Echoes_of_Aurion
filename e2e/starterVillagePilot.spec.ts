import { expect, test } from "@playwright/test";

test.skip(process.env.AURION_STARTER_VILLAGE_BROWSER_E2E !== "1", "Requires the isolated authenticated starter-village runtime");

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "landscape", width: 932, height: 430 },
] as const;

for (const viewport of viewports) test(`${viewport.name}: confirmed pilot controls and readbacks remain reachable`, async ({ page }, testInfo) => {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
  await dialog.getByLabel("Rufname", { exact: true }).fill(`pilot_${viewport.name}_${process.env.AURION_TEST_SOURCE_SHA!.slice(0, 6)}`);
  await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-browser-pilot-only!");
  await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
  await page.getByRole("button", { name: "SPIEL BETRETEN", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByTestId("xaurion-open-world-runtime")).toBeVisible({ timeout: 30_000 });
  const characterGate = page.getByTestId("player-character-selection-gate");
  if (await characterGate.isVisible().catch(() => false)) {
    await characterGate.getByRole("radio").first().click({ force: true, timeout: 15_000 });
    await characterGate.getByRole("button", { name: "Dauerhaft wählen", exact: true }).click({ force: true });
    await expect(characterGate).toHaveCount(0);
  }
  await expect(page.getByTestId("ax1-movement-control")).toBeVisible();
  await expect(page.getByTestId("authoritative-world-hud")).toContainText(/Kontakt|serverbestätigt/);
  await page.keyboard.press("j");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("j");
  await page.getByRole("button", { name: "NPC", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-starter-pilot.png`), fullPage: true });
  await testInfo.attach("emulation-scope", { body: JSON.stringify({ viewport, evidence: "Chromium browser emulation only", physicalAndroidOrGpuProof: false }), contentType: "application/json" });
});
