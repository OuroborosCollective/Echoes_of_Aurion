import { expect, test } from "@playwright/test";

function recordUnexpectedConsoleErrors(page: import("@playwright/test").Page, isExpected = (_message: string) => false) {
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
  await page.getByRole("button", { name: "GLB-Einreichung öffnen", exact: true }).click();
  const community = page.getByLabel("Aurion Gemeinschaft");
  await expect(community.getByText("Öffentlicher Aurion-Katalog")).toBeVisible();
  await expect(community.locator('input[type="file"]')).toHaveCount(0);
  await expect(community.getByRole("button", { name: "Als Charakter wählen" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("guest cannot start AX1 before authentication", async ({ page }) => {
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/");
  await expect(page.getByText("Konto erforderlich", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("no-WebGL environment keeps Aurion access and community available without mounting gameplay", async ({ page }) => {
  const errors = recordUnexpectedConsoleErrors(page);
  await page.goto("/?aurion_runtime=no-webgl");
  await expect(page.getByRole("button", { name: /KONTO ANLEGEN \/ ANMELDEN/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "GLB-Einreichung öffnen", exact: true })).toBeVisible();
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
