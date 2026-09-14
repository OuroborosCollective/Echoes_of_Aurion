import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { testAnimatedPlayerGlb } from "./glbImportFixtures";
import { extractGlbZipEntry, prepareGlbZipBatch, readGlbZipDirectory } from "./glbZipBatch";

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

function zip(entries: readonly Readonly<{ name: string; bytes: Buffer; method?: 0 | 8 }>[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const method = entry.method ?? 8;
    const compressed = method === 0 ? entry.bytes : deflateRawSync(entry.bytes);
    const checksum = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

describe("GLB ZIP batch", () => {
  it("routes purpose folders, verifies deflate+CRC and keeps LOD siblings in one family", () => {
    const lod0 = testAnimatedPlayerGlb("Female_Ranger_LOD0");
    const lod1 = testAnimatedPlayerGlb("Female_Ranger_LOD1");
    const archive = zip([
      { name: "npc-fallback/Female_Ranger_LOD0.glb", bytes: lod0 },
      { name: "npc-fallback/Female_Ranger_LOD1.glb", bytes: lod1 },
    ]);
    const directory = readGlbZipDirectory(archive, "auto");
    expect(directory).toHaveLength(2);
    expect(directory.every(entry => entry.purpose === "npc-fallback")).toBe(true);
    expect(extractGlbZipEntry(archive, directory[0]!)).toEqual(lod0);

    const prepared = prepareGlbZipBatch(archive, "auto");
    expect(prepared.entries).toHaveLength(2);
    expect(prepared.familyCount).toBe(1);
    expect(prepared.entries.map(entry => entry.lodLevel)).toEqual([0, 1]);
    expect(prepared.entries.every(entry => entry.plan.assetType === "character")).toBe(true);
  });

  it("uses the explicit fallback purpose for flat ZIPs", () => {
    const archive = zip([{ name: "Universal_Female.glb", bytes: testAnimatedPlayerGlb("Universal_Female") }]);
    const prepared = prepareGlbZipBatch(archive, "npc-fallback");
    expect(prepared.entries[0]).toMatchObject({ purpose: "npc-fallback", displayName: "Universal Female" });
  });

  it("rejects path traversal before extracting bytes", () => {
    const archive = zip([{ name: "../escape.glb", bytes: testAnimatedPlayerGlb("Escape") }]);
    expect(() => readGlbZipDirectory(archive)).toThrow("GLB_ZIP_PATH_INVALID");
  });

  it("rejects duplicate LOD levels that would make catalog grouping ambiguous", () => {
    const bytes = testAnimatedPlayerGlb("Female_Ranger");
    const archive = zip([
      { name: "npc-fallback/Female_Ranger_LOD0.glb", bytes },
      { name: "npc-fallback/Female-Ranger-LOD0.glb", bytes },
    ]);
    expect(() => prepareGlbZipBatch(archive)).toThrow("GLB_ZIP_DUPLICATE_LOD");
  });

  it("rejects non-GLB payloads instead of silently unpacking arbitrary files", () => {
    const archive = zip([{ name: "npc-fallback/README.txt", bytes: Buffer.from("not a glb") }]);
    expect(() => readGlbZipDirectory(archive)).toThrow("GLB_ZIP_GLB_NAME_REQUIRED");
  });
});
