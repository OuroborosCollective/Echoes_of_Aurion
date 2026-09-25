import { test, expect } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { deflateRawSync } from "node:zlib";
import { testAnimatedPlayerGlb } from "../server/glbImportFixtures";

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    table[value] = crc >>> 0;
  }
  return table;
})();
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries: readonly Readonly<{ name: string; bytes: Buffer }>[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.bytes);
    const checksum = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(entry.bytes.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(entry.bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(centralBytes.length, 12); eocd.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires disposable GLB CI database");
test("admin ZIP upload preflights, unpacks and groups LOD GLBs through the real catalog", async ({ page, baseURL }, testInfo) => {
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const target = new URL(process.env.DATABASE_URL!);
  expect(target.hostname).toBe("127.0.0.1");
  expect(target.pathname).toBe("/aurion_glb_test");
  const pool = createPool(process.env.DATABASE_URL!);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
    await dialog.getByLabel("Rufname", { exact: true }).fill("glb_zip_browser_admin");
    await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-glb-zip-test-only!");
    await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Eine Welt, die nicht auf dich wartet./ })).toBeVisible();
    await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toBeVisible();
    // Verify the session is authenticated but not yet admin, mirroring the
    // glbImport lane. This confirms the server has the user in its DB before
    // the direct MariaDB role elevation.
    expect((await page.request.get("/api/admin/glb-import/status")).status()).toBe(403);
    await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='admin' WHERE c.handle='glb_zip_browser_admin'");

    await page.goto("/ops/glb-upload");
    // Synchronize on the real storage/catalog readback before asserting the ZIP
    // control. The test elevates this disposable account directly in MariaDB,
    // so React auth + catalog hydration may legitimately complete after route
    // navigation; readiness, not elapsed wall time, is the user-visible gate.
    await expect(page.getByTestId("glb-upload-scroll-region")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status")).toContainText("Dateispeicher bereit", { timeout: 15_000 });
    const input = page.locator("#glbZipFile");
    await expect(input).toBeEnabled();
    const lod0 = testAnimatedPlayerGlb("Zip_Character_Female_Ranger_LOD0");
    const lod1 = testAnimatedPlayerGlb("Zip_Character_Female_Ranger_LOD1");
    expect(lod0.equals(lod1)).toBe(false);
    const archive = zip([
      { name: "npc-fallback/Female_Ranger_LOD0.glb", bytes: lod0 },
      { name: "npc-fallback/Female_Ranger_LOD1.glb", bytes: lod1 },
    ]);
    const responsePromise = page.waitForResponse(response => response.url().includes("/api/admin/glb-zip-upload?purpose=auto") && response.request().method() === "POST");
    await input.setInputFiles({ name: "browser-npc-lods.zip", mimeType: "application/zip", buffer: archive });
    const response = await responsePromise;
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(201);
    expect(body).toMatchObject({ accepted: true, fileCount: 2, familyCount: 1 });
    expect(body.entries.map((entry: any) => entry.lodLevel)).toEqual([0, 1]);
    expect(body.entries.every((entry: any) => entry.purpose === "npc-fallback")).toBe(true);
    await expect(page.getByText("2 GLBs · 1 logische Familien aufgenommen")).toBeVisible();

    const catalogResponse = await page.request.get("/api/game/glb-catalog");
    expect(catalogResponse.status()).toBe(200);
    const catalog = await catalogResponse.json();
    const family = catalog.entries.find((entry: any) => entry.purpose === "npc-fallback" && entry.displayName.includes("Female Ranger") && entry.lods?.length === 2);
    expect(family).toBeTruthy();
    expect(family.lods.map((lod: any) => lod.level)).toEqual([0, 1]);

    const stored0 = await page.request.get(body.entries[0].receipt.storageUrl);
    const stored1 = await page.request.get(body.entries[1].receipt.storageUrl);
    expect(stored0.status()).toBe(200); expect(await stored0.body()).toEqual(lod0);
    expect(stored1.status()).toBe(200); expect(await stored1.body()).toEqual(lod1);

    const [rows] = await pool.query<RowDataPacket[]>("SELECT id, sha256, bytes, displayName, status FROM glbAssets WHERE id IN (?, ?) ORDER BY displayName", [body.entries[0].receipt.assetId, body.entries[1].receipt.assetId]);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.status === "approved")).toBe(true);
    await testInfo.attach("glb-zip-batch-evidence", {
      body: JSON.stringify({ revision: process.env.AURION_RELEASE_SHA, archiveSha256: body.archiveSha256, receipts: body.entries.map((entry: any) => entry.receipt), family, byteReadback: true }),
      contentType: "application/json",
    });
  } finally { await pool.end(); }
});
