import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const runEmptyDiagnostic = process.env.AURION_STARTER_VILLAGE_EMPTY_CATALOG_E2E === "1";
const runJourney = process.env.AURION_STARTER_VILLAGE_BROWSER_E2E === "1";
const sourceSha = process.env.AURION_TEST_SOURCE_SHA ?? "unknown";
const evidenceDir = process.env.AURION_EVIDENCE_DIR ?? ".aurion-evidence/starter-village-pilot";

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "landscape", width: 932, height: 430 },
] as const;

type CatalogBody = {
  version?: string;
  revision?: string;
  entries?: Array<Record<string, unknown>>;
  selected?: Record<string, unknown> | null;
  immutable?: boolean;
};

function boundedMessage(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[redacted-jwt]")
    .slice(0, 400);
}

async function writeEvidenceFile(name: string, value: unknown) {
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function registerAndLaunch(page: Page, handle: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
  await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
  await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-browser-pilot-only!");
  await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
  await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toBeVisible({ timeout: 30_000 });

  const catalogReply = page.waitForResponse(response =>
    response.url().endsWith("/api/game/public-player-characters") &&
    response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "SPIEL BETRETEN", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByTestId("xaurion-open-world-runtime")).toBeVisible({ timeout: 30_000 });
  return catalogReply;
}

test("diagnostic: fresh isolated catalog reproduces the pre-fix empty character gate without timing out", async ({ page }, testInfo) => {
  test.skip(!runEmptyDiagnostic, "Runs only before canonical public-character admission");
  await page.setViewportSize(viewports[0]);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(boundedMessage(error)));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(boundedMessage(message.text())); });

  const catalogReply = await registerAndLaunch(page, `pilot_empty_${sourceSha.slice(0, 6)}`);
  expect(catalogReply.status()).toBe(200);
  const catalog = await catalogReply.json() as CatalogBody;
  expect(catalog.entries).toEqual([]);
  expect(catalog.selected).toBeNull();

  const gate = page.getByTestId("player-character-selection-gate");
  await expect(gate).toBeVisible();
  const picker = gate.getByTestId("public-character-picker");
  await expect(picker).toHaveAttribute("data-catalog-state", "empty");
  await expect(gate.getByTestId("public-character-catalog-empty")).toBeVisible();
  await expect(gate.getByRole("radio")).toHaveCount(0);

  const screenshot = path.join(evidenceDir, "empty-catalog-diagnostic.png");
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  await writeEvidenceFile("empty-catalog-diagnostic.json", {
    schema: "aurion.starter-village-browser-diagnostic.v1",
    revision: sourceSha,
    expectedCondition: "fresh-migrated-database-before-public-character-admission",
    catalog: {
      status: catalogReply.status(),
      version: catalog.version ?? null,
      revision: catalog.revision ?? null,
      entryCount: catalog.entries?.length ?? null,
      selected: catalog.selected ?? null,
    },
    dom: { gateVisible: true, catalogState: "empty", radioCount: 0 },
    browser: { pageErrors, consoleErrors },
    screenshot: path.basename(screenshot),
    rawSessionMaterialIncluded: false,
  });
  await testInfo.attach("empty-catalog-diagnostic-scope", {
    body: JSON.stringify({ revision: sourceSha, catalogState: "empty", radioCount: 0 }),
    contentType: "application/json",
  });
});

for (const viewport of viewports) test(`${viewport.name}: confirmed pilot controls and readbacks remain reachable`, async ({ page }, testInfo) => {
  test.skip(!runJourney, "Requires the isolated authenticated starter-village runtime after canonical asset admission");
  await page.setViewportSize(viewport);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(boundedMessage(error)));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(boundedMessage(message.text())); });

  const seed = JSON.parse(await readFile(path.join(evidenceDir, "public-character-seed.json"), "utf8")) as {
    assetId: string;
    sha256: string;
    storageUrl: string;
    catalogRevision: string;
  };
  const catalogReply = await registerAndLaunch(page, `pilot_${viewport.name}_${sourceSha.slice(0, 6)}`);
  expect(catalogReply.status()).toBe(200);
  const catalog = await catalogReply.json() as CatalogBody;
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  const admitted = entries.find(entry => entry.assetId === seed.assetId);
  expect(admitted).toMatchObject({
    assetId: seed.assetId,
    sha256: seed.sha256,
    storageUrl: seed.storageUrl,
    purpose: "player-public",
    assetType: "character",
    targetKey: null,
  });
  expect(catalog.selected).toBeNull();

  const characterGate = page.getByTestId("player-character-selection-gate");
  await expect(characterGate).toBeVisible();
  const picker = characterGate.getByTestId("public-character-picker");
  await expect(picker).toHaveAttribute("data-catalog-state", "ready");
  const avatar = characterGate.getByRole("radio", { name: /Starter Village Pilot Public Avatar/ });
  await expect(avatar).toBeVisible();
  await avatar.click();

  const selectionReply = page.waitForResponse(response =>
    response.url().endsWith("/api/game/public-player-characters/select") &&
    response.request().method() === "POST",
  );
  await characterGate.getByRole("button", { name: "Dauerhaft wählen", exact: true }).click();
  const selectedReply = await selectionReply;
  expect(selectedReply.status()).toBe(200);
  const selected = await selectedReply.json();
  expect(selected).toMatchObject({
    assetId: seed.assetId,
    storageUrl: seed.storageUrl,
    visibility: "public",
    immutable: true,
  });
  await expect(characterGate).toHaveCount(0);

  const stored = await page.request.get(seed.storageUrl);
  expect(stored.status(), "confirmed GLB byte route must be readable before renderer activation").toBe(200);
  expect((await stored.body()).length).toBeGreaterThan(0);
  await expect(page.getByTestId("glb-model-status")).toHaveText("active", { timeout: 45_000 });

  const movement = page.getByTestId("ax1-movement-control");
  await expect(movement).toBeVisible();
  const hud = page.getByTestId("authoritative-world-hud");
  await expect(hud).toContainText(/Kontakt|Serverbestätigt/);
  await page.keyboard.press("j");
  const questDialog = page.getByRole("dialog");
  await expect(questDialog).toBeVisible();
  await page.keyboard.press("j");
  await expect(questDialog).toBeHidden();
  await hud.getByRole("button", { name: "Weitere Menüs", exact: true }).click();
  const expandedMenu = page.getByRole("dialog", { name: "Weitere Menüs" });
  await expect(expandedMenu).toBeVisible();
  await expandedMenu.getByRole("button", { name: "NPC", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const rendererEvidenceRaw = await page.getByTestId("renderer-evidence").textContent();
  const screenshot = path.join(evidenceDir, `${viewport.name}-starter-pilot.png`);
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  await writeEvidenceFile(`browser-trace-${viewport.name}.json`, {
    schema: "aurion.starter-village-browser-trace.v1",
    revision: sourceSha,
    viewport,
    catalog: {
      status: catalogReply.status(),
      version: catalog.version ?? null,
      revision: catalog.revision ?? null,
      entryCount: entries.length,
      admittedAsset: {
        assetId: seed.assetId,
        sha256: seed.sha256,
        storageUrl: seed.storageUrl,
      },
    },
    selection: {
      status: selectedReply.status(),
      assetId: selected.assetId,
      storageUrl: selected.storageUrl,
      visibility: selected.visibility,
      immutable: selected.immutable,
    },
    runtime: {
      gateReleased: true,
      modelStatus: "active",
      storedAssetReadbackStatus: stored.status(),
      movementVisible: await movement.isVisible(),
      authoritativeHudVisible: await hud.isVisible(),
      rendererEvidence: rendererEvidenceRaw ? JSON.parse(rendererEvidenceRaw) : null,
    },
    browser: { pageErrors, consoleErrors },
    screenshot: path.basename(screenshot),
    evidence: "Chromium browser emulation only",
    physicalAndroidOrGpuProof: false,
    rawSessionMaterialIncluded: false,
  });
  expect(pageErrors).toEqual([]);
  await testInfo.attach("emulation-scope", {
    body: JSON.stringify({ viewport, revision: sourceSha, evidence: "Chromium browser emulation only", physicalAndroidOrGpuProof: false }),
    contentType: "application/json",
  });
});
