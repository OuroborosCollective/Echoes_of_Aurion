import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLB_IMPORT_VERSION, type GlbImportReceipt } from "../shared/glbImportContract";
import { testAnimatedPlayerGlb } from "./glbImportFixtures";
import { buildGlbImportPlan } from "./glbImportPlan";
import { MAX_GLB_ZIP_BYTES } from "./glbZipBatch";
import { createGlbZipUploadHandler, type GlbZipUploadDependencies } from "./glbZipUpload";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

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

function successfulDependencies() {
  const ingest = vi.fn<GlbZipUploadDependencies["ingest"]>(async (_userId, input) => {
    const plan = buildGlbImportPlan(input.contentBase64, input.purpose, input.fileName);
    expect(plan.planSha256).toBe(input.expectedPlanSha256);
    return {
      version: GLB_IMPORT_VERSION,
      assetId: plan.assetId,
      sha256: plan.sha256,
      bytes: plan.bytes,
      storageUrl: `/api/assets/glb/${plan.sha256}.glb`,
      assetType: plan.assetType,
      targetKey: plan.targetKey,
      planSha256: plan.planSha256,
      status: "catalog",
      activeAssetId: null,
      deduplicated: false,
    } satisfies GlbImportReceipt;
  });
  const dependencies: GlbZipUploadDependencies = {
    authenticate: async () => ({ id: 7, role: "admin" }),
    ingest,
    catalog: async () => ({ version: GLB_IMPORT_VERSION, revision: "c".repeat(64), entries: [] }),
  };
  return { dependencies, ingest };
}

async function withApp(dependencies: GlbZipUploadDependencies) {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.post(
    "/api/admin/glb-zip-upload",
    express.raw({ type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"], limit: MAX_GLB_ZIP_BYTES }),
    createGlbZipUploadHandler(dependencies),
  );
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("GLB ZIP upload HTTP boundary", () => {
  it("accepts raw ZIP bytes after the global JSON parser and returns per-file receipts", async () => {
    const { dependencies, ingest } = successfulDependencies();
    const baseUrl = await withApp(dependencies);
    const archive = zip([
      { name: "npc-fallback/Female_Ranger_LOD0.glb", bytes: testAnimatedPlayerGlb("Character_Female_Ranger_LOD0") },
      { name: "npc-fallback/Female_Ranger_LOD1.glb", bytes: testAnimatedPlayerGlb("Character_Female_Ranger_LOD1") },
    ]);
    const response = await fetch(`${baseUrl}/api/admin/glb-zip-upload?purpose=auto`, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: archive,
    });
    const body = await response.json() as Record<string, any>;
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ accepted: true, fileCount: 2, familyCount: 1, catalogRevision: "c".repeat(64) });
    expect(body.entries.map((entry: any) => entry.lodLevel)).toEqual([0, 1]);
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(ingest.mock.calls.every(([, input]) => input.purpose === "npc-fallback")).toBe(true);
  });

  it("preflights the complete archive before the first catalog mutation", async () => {
    const { dependencies, ingest } = successfulDependencies();
    const baseUrl = await withApp(dependencies);
    const archive = zip([
      { name: "npc-fallback/Valid_LOD0.glb", bytes: testAnimatedPlayerGlb("Character_Valid_LOD0") },
      { name: "npc-fallback/Broken_LOD1.glb", bytes: Buffer.alloc(16, 0x41) },
    ]);
    const response = await fetch(`${baseUrl}/api/admin/glb-zip-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: archive,
    });
    expect(response.status).toBe(422);
    expect(ingest).not.toHaveBeenCalled();
    const body = await response.json() as Record<string, unknown>;
    expect(String(body.error)).toMatch(/^GLB_/);
  });

  it("rejects non-admin callers before archive processing", async () => {
    const { dependencies, ingest } = successfulDependencies();
    const baseUrl = await withApp({ ...dependencies, authenticate: async () => ({ id: 8, role: "user" }) });
    const archive = zip([{ name: "npc-fallback/Female.glb", bytes: testAnimatedPlayerGlb("Female") }]);
    const response = await fetch(`${baseUrl}/api/admin/glb-zip-upload`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: archive });
    expect(response.status).toBe(403);
    expect(ingest).not.toHaveBeenCalled();
  });
});
