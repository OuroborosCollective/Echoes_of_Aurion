import { expect, test } from "@playwright/test";

function recordUnexpectedConsoleErrors(page: import("@playwright/test").Page, isExpected = (_message: string) => false) {
  const errors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && !isExpected(message.text())) errors.push(message.text());
  });
  return errors;
}

test("guest selects both starter characters and sees a read-only asset catalog", async ({ page }) => {
  test.slow();
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/");

  const starterPicker = page.getByLabel("Standard-Charaktermodell wählen");
  await expect(starterPicker).toBeVisible();
  await page.getByRole("button", { name: /Veilguard STERNWARTEN-WÄCHTERIN/ }).click();
  await expect(starterPicker.locator("button.active")).toContainText("Veilguard");
  await page.getByRole("button", { name: /Wayfinder BEWEGLICHER EXPEDITIONSSCOUT/ }).click();
  await expect(starterPicker.locator("button.active")).toContainText("Wayfinder");

  await page.getByRole("button", { name: "GLB-Einreichung öffnen" }).click();
  const community = page.getByLabel("Aurion Gemeinschaft");
  await expect(community.getByText("Öffentlicher Aurion-Katalog")).toBeVisible();
  await expect(community.getByText("Wayfinder", { exact: true })).toBeVisible();
  await expect(community.getByText("Veilguard", { exact: true })).toBeVisible();
  await expect(community.locator('input[type="file"]')).toHaveCount(0);
  await expect(community.getByRole("button", { name: "Als Charakter wählen" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("guest enters the solo loadout without an LLM or human team", async ({ page }) => {
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
  await expect(page.getByRole("heading", { name: /Setze den Resonanzkurs/ })).toBeVisible();
  await expect(page.getByText("SOLO // ECHO-AUTOMATIK", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /STERNWARTE BETRETEN/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("WebGL fallback keeps the access and community surface available", async ({ page }) => {
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/?aurion_runtime=no-webgl");
  await expect(page.getByTestId("webgl-fallback")).toContainText("Zugang und Gemeinschaft bleiben aktiv");
  await expect(page.getByRole("button", { name: "GLB-Einreichung öffnen" })).toBeVisible();
  await expect(page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("production static runtime loads Babylon without an external CDN", async ({ page }) => {
  test.skip(process.env.AURION_E2E_STATIC !== "1", "Dieser Smoke-Test läuft gegen den veröffentlichten Static-Release.");
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  const externalBabylonRequests = await page.evaluate(() => performance.getEntriesByType("resource")
    .map(entry => entry.name)
    .filter(name => name.includes("cdn.jsdelivr.net/npm/@babylonjs")));
  expect(externalBabylonRequests).toEqual([]);
  expect(errors).toEqual([]);
});
