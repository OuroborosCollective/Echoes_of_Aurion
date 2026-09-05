import { test, expect } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { createHash } from "node:crypto";
import { testGlb } from "../server/glbImportFixtures";

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires disposable GLB CI database");
test("admin upload persists bytes and assignment, deduplicates, and renders the published avatar", async ({ page, baseURL }, testInfo) => {
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
    await page.getByRole('button', { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
    await expect(page.getByRole('heading', { name: /Willkommen zurück/ })).toBeVisible();
    expect((await page.request.get('/api/admin/glb-import/status')).status()).toBe(403);
    // Explicit fixture setup, guarded above against any live target.
    await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='admin' WHERE c.handle='glb_browser_admin'");
    await page.goto('/ops/glb-upload');
    const input = page.locator('#smartGlbFile');
    await expect(input).toBeEnabled();
    const bytes = testGlb('Aurion_Player', { nodes: [{ name: 'Aurion_Player', mesh: 0 }, { name: 'root_joint' }], skins: [{ joints: [1] }] });
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
    const fetched: string[] = [];
    page.on('response', response => { if (response.url().endsWith(receipt.storageUrl) && response.status() === 200) fetched.push(response.url()); });
    await page.goto('/');
    const solo = page.getByRole('button', { name: /ALLEIN DIE STERNWARTE BETRETEN/ });
    if (await solo.isVisible()) await solo.click();
    await page.getByRole('button', { name: 'IN DIE OPEN WORLD', exact: true }).click();
    await expect(page.getByTestId('xaurion-open-world-runtime')).toBeVisible();
    await expect(page.getByTestId('glb-model-status')).toHaveText('active', { timeout: 45_000 });
    expect(fetched.length).toBeGreaterThan(0);
    await expect(page.locator('#three-viewport canvas')).toBeVisible();
    await page.locator('#three-viewport canvas').screenshot({ path: testInfo.outputPath('imported-avatar.png') });
    await testInfo.attach('glb-persistence-render-evidence', { body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, receipt, db: rows[0], byteReadback: true, rendererLoaded: true }), contentType: 'application/json' });
  } finally { await pool.end(); }
});
