import { test, expect } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { createHash } from "node:crypto";
import { testAnimatedPlayerGlb } from "../server/glbImportFixtures";

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires disposable GLB CI database");
test("admin upload persists bytes and assignment, deduplicates, scrolls on mobile, and renders the published avatar", async ({ page, baseURL }, testInfo) => {
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const target = new URL(process.env.DATABASE_URL!);
  expect(target.hostname).toBe("127.0.0.1"); expect(target.pathname).toBe("/aurion_glb_test");
  const pool = createPool(process.env.DATABASE_URL!);
  const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name"); expect(database[0].name).toBe("aurion_glb_test");
  try {
    expect((await page.request.get('/api/admin/glb-import/status')).status()).toBe(401);
    await page.goto('/');
    await page.getByRole('button', { name: 'KONTO ANLEGEN / ANMELDEN', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Konto anlegen', exact: true }).click();
    await dialog.getByLabel('Rufname', { exact: true }).fill('glb_browser_admin');
    await dialog.getByLabel('Passwort', { exact: true }).fill('Aurion-isolated-glb-test-only!');
    await dialog.getByRole('button', { name: 'Aurion-Konto erstellen', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Willkommen zurück/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SPIEL BETRETEN', exact: true })).toBeVisible();
    expect((await page.request.get('/api/admin/glb-import/status')).status()).toBe(403);
    await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='admin' WHERE c.handle='glb_browser_admin'");
    await page.setViewportSize({ width: 412, height: 732 });
    await page.goto('/ops/glb-upload');
    const scrollRegion = page.getByTestId('glb-upload-scroll-region');
    await expect(scrollRegion).toBeVisible();
    const scrollMetrics = await scrollRegion.evaluate(element => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
    await scrollRegion.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => scrollRegion.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await scrollRegion.evaluate(element => { element.scrollTop = 0; });

    const input = page.locator('#smartGlbFile');
    await expect(input).toBeEnabled();
    const bytes = testAnimatedPlayerGlb('Aurion_Player');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const upload = async () => {
      const response = page.waitForResponse(r => r.url().endsWith('/api/admin/glb-smart-upload') && r.request().method() === 'POST');
      await input.setInputFiles({ name: 'browser-player.glb', mimeType: 'model/gltf-binary', buffer: bytes });
      const result = await response; expect(result.status()).toBe(201);
      return (await result.json()).receipt;
    };
    const receipt = await upload();
    expect(receipt).toMatchObject({ sha256, bytes: bytes.length, status: 'assigned', targetKey: 'starter_player', deduplicated: false });
    await expect(input).toBeEnabled();
    const duplicate = await upload(); expect(duplicate).toMatchObject({ assetId: receipt.assetId, deduplicated: true, status: 'assigned' });
    const [rows] = await pool.query<RowDataPacket[]>("SELECT g.id, g.sha256, g.bytes, g.status, a.targetKey FROM glbAssets g JOIN glbAssignments a ON a.assetId=g.id AND a.active=1 WHERE g.sha256=?", [sha256]);
    expect(rows).toEqual([expect.objectContaining({ id: receipt.assetId, sha256, bytes: bytes.length, status: 'approved', targetKey: 'starter_player' })]);
    const stored = await page.request.get(receipt.storageUrl);
    expect(stored.status()).toBe(200); expect(await stored.body()).toEqual(bytes);
    expect((await (await page.request.get('/api/game/starter-glb-assets')).json()).player.assetId).toBe(receipt.assetId);

    // The short-lived agent credential still has its own cryptographic regression;
    // this browser lane only proves that the authenticated product can issue it.
    const sessionReply = page.waitForResponse(r => r.url().endsWith('/api/admin/glb-import/agent-session'));
    await page.getByRole('button', { name: 'Import-Zugang für eine Stunde erstellen', exact: true }).click();
    const sessionResponse = await sessionReply; expect(sessionResponse.status()).toBe(200);

    // Publish a distinct animated humanoid through the same player-public UI lane
    // used by the owner's standardized male/female uploads.
    const publicBytes = testAnimatedPlayerGlb('Aurion_Public_Player');
    const publicSha256 = createHash('sha256').update(publicBytes).digest('hex');
    await page.getByLabel('Kategorie / Verwendungszweck').selectOption('player-public');
    await page.getByLabel('Anzeigename (optional bei Einzeldatei)').fill('Browser public avatar');
    const publicReply = page.waitForResponse(r => r.url().endsWith('/api/admin/glb-smart-upload') && r.request().method() === 'POST');
    await input.setInputFiles({ name: 'browser-public-player.glb', mimeType: 'model/gltf-binary', buffer: publicBytes });
    const publicResponse = await publicReply; expect(publicResponse.status()).toBe(201);
    const publicBody = await publicResponse.json();
    const publicReceipt = publicBody.receipt;
    expect(publicBody).toMatchObject({ purpose: 'player-public', classification: { assetType: 'character' } });
    expect(publicReceipt).toMatchObject({ sha256: publicSha256, bytes: publicBytes.length, targetKey: null, status: 'catalog', deduplicated: false });
    const publicStored = await page.request.get(publicReceipt.storageUrl);
    expect(publicStored.status()).toBe(200); expect(await publicStored.body()).toEqual(publicBytes);

    const fetched: string[] = [];
    page.on('response', response => { if (response.url().endsWith(publicReceipt.storageUrl) && response.status() === 200) fetched.push(response.url()); });
    await page.goto('/');
    const launch = page.getByRole('button', { name: 'SPIEL BETRETEN', exact: true });
    await expect(launch).toBeVisible({ timeout: 30_000 });
    await launch.click();
    await expect(page).toHaveURL(/\/play$/, { timeout: 30_000 });
    const runtime = page.getByTestId('xaurion-open-world-runtime');
    await expect(runtime).toBeVisible();
    const gate = page.getByTestId('player-character-selection-gate');
    await expect(gate).toBeVisible({ timeout: 15_000 });
    await gate.getByRole('radio', { name: /Browser public avatar/ }).click();
    const selectionReply = page.waitForResponse(r => r.url().endsWith('/api/game/public-player-characters/select') && r.request().method() === 'POST');
    await gate.getByRole('button', { name: 'Dauerhaft wählen', exact: true }).click();
    const selected = await selectionReply; expect(selected.status()).toBe(200);
    expect(await selected.json()).toMatchObject({ assetId: publicReceipt.assetId, storageUrl: publicReceipt.storageUrl, visibility: 'public', immutable: true });

    await expect(page.getByTestId('glb-model-status')).toHaveText('active', { timeout: 45_000 });
    const presentation = page.getByTestId('glb-presentation');
    await expect.poll(async () => {
      const raw = await presentation.getAttribute('data-presentation');
      if (!raw) return null;
      const evidence = JSON.parse(raw);
      return { clip: evidence?.clip ?? null, poses: evidence?.supportedPoses ?? [], names: evidence?.animationNames ?? [] };
    }, { timeout: 15_000 }).toMatchObject({ clip: 'Idle', poses: expect.arrayContaining(['idle', 'attack']), names: expect.arrayContaining(['Attack', 'Idle']) });
    expect(fetched.length).toBeGreaterThan(0);
    await expect(page.locator('#three-viewport canvas')).toBeVisible();
    await page.locator('#three-viewport canvas').screenshot({ path: testInfo.outputPath('imported-avatar.png') });
    await testInfo.attach('glb-persistence-render-evidence', { body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, starterReceipt: receipt, publicReceipt, db: rows[0], byteReadback: true, publicSelectionReadback: true, rendererLoaded: true, mobileScroll: scrollMetrics, animationContract: ['Idle', 'Attack'], launchRoute: 'portal-confirmed-public-character-then-ax1' }), contentType: 'application/json' });
  } finally { await pool.end(); }
});
