import { expect, test } from "@playwright/test";
import { ensurePublicAvatar } from "./helpers/aurionAuthenticated";

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
  const handle = `pilot_${viewport.name}_${process.env.AURION_TEST_SOURCE_SHA!.slice(0, 6)}`;
  await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
  await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-browser-pilot-only!");
  await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
  const publicAvatarName = `Starter pilot avatar ${viewport.name}`;
  await ensurePublicAvatar(page, handle, publicAvatarName);
  await page.getByRole("button", { name: "SPIEL BETRETEN", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByTestId("xaurion-open-world-runtime")).toBeVisible({ timeout: 30_000 });
  const characterGate = page.getByTestId("player-character-selection-gate");
  const publicAvatar = characterGate.getByRole("radio", { name: publicAvatarName, exact: true });
  const connected = page.getByTestId("xaurion-open-world-runtime").getByText("BEWEGUNG VERBUNDEN", { exact: true });
  await expect(publicAvatar.or(connected).first()).toBeVisible({ timeout: 45_000 });
  if (await publicAvatar.isVisible()) {
    await publicAvatar.click();
    const selectionReply = page.waitForResponse(response => response.url().endsWith("/api/game/public-player-characters/select") && response.request().method() === "POST");
    await characterGate.getByRole("button", { name: "Dauerhaft wählen", exact: true }).click();
    expect((await selectionReply).status()).toBe(200);
  }
  await expect(connected).toBeVisible({ timeout: 45_000 });
  const movement = page.getByTestId("ax1-movement-control");
  await expect(movement).toBeVisible();
  await expect(movement).toHaveAttribute("data-active", "false");
  await expect(page.getByTestId("ax1-starter-npc-beacon")).toBeVisible();
  await expect(page.getByTestId("ax1-starter-npc-beacon")).toContainText("serverbestätigt");
  await expect(page.getByTestId("authoritative-world-hud")).toContainText(/Kontakt|serverbestätigt/);
  await page.keyboard.press("j");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("j");
  await page.getByRole("button", { name: "NPC", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-starter-pilot.png`), fullPage: true });
  await testInfo.attach("emulation-scope", { body: JSON.stringify({ viewport, evidence: "Chromium browser emulation only", physicalAndroidOrGpuProof: false }), contentType: "application/json" });
});
