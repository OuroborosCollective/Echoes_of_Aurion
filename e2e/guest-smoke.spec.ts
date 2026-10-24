import { expect, test } from "@playwright/test";

function recordUnexpectedConsoleErrors(page: import("@playwright/test").Page, isExpected = (_message: string) => _message.includes("failed to connect to websocket") || _message.includes("WebSocket connection to")) {
  const errors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && !isExpected(message.text())) errors.push(message.text());
  });
  return errors;
}

test("guest sees Aurion website and a read-only public asset catalog", async ({ page }) => {
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/ })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Asset-Katalog öffnen", exact: true }).click();
  const community = page.getByLabel("Aurion Gemeinschaft");
  await expect(community.getByText("Öffentlicher Aurion-Katalog")).toBeVisible();
  await expect(community.locator('input[type="file"]')).toHaveCount(0);
  await expect(community.getByRole("button", { name: "Als Charakter wählen" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("guest opens Home Events through the accessible community overlay", async ({ page }) => {
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/");
  const eventsButton = page.getByRole("button", { name: "Events", exact: true, description: "Events öffnen" });
  await expect(eventsButton).toHaveAttribute("aria-haspopup", "dialog");
  await eventsButton.click();
  const community = page.getByLabel("Aurion Gemeinschaft");
  const eventsDialog = community.getByRole("dialog", { name: "Community-Events", exact: true });
  await expect(eventsDialog).toBeVisible();
  await expect(eventsDialog).toBeFocused();
  await community.getByRole("button", { name: "Community-Konsole schließen", exact: true }).click();
  await expect(eventsButton).toBeFocused();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});


test("guest opens Home Rangliste through an anonymous read-only dialog", async ({ page }) => {
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Rangliste", exact: true }).click();
  const dialog = page.getByLabel("Aurion Gemeinschaft").getByRole("dialog", { name: "Saison-Rangliste" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(dialog.getByText("Sortiert nach bestätigten Saisonpunkten, Siegen und Stufe.")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("guest cannot start AX1 before authentication", async ({ page }) => {
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("no-WebGL environment keeps Aurion access and community available without mounting gameplay", async ({ page }) => {
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/?aurion_runtime=no-webgl");
  await expect(page.getByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Asset-Katalog öffnen", exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("production portal does not load Babylon from an external CDN", async ({ page }) => {
  test.skip(process.env.AURION_E2E_STATIC !== "1", "Dieser Smoke-Test läuft gegen den veröffentlichten Static-Release.");
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(0);
  const externalBabylonRequests = await page.evaluate(() => performance.getEntriesByType("resource")
    .map(entry => entry.name)
    .filter(name => name.includes("cdn.jsdelivr.net/npm/@babylonjs")));
  expect(externalBabylonRequests).toEqual([]);
  expect(errors).toEqual([]);
});
