import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  glbImportPurposes,
  glbLodDescriptor,
  type GlbImportPurpose,
  type GlbLodLevel,
} from "../shared/glbImportContract";
import { buildGlbImportPlan } from "./glbImportPlan";

export const MAX_GLB_ZIP_BYTES = 768 * 1024 * 1024;
export const MAX_GLB_ZIP_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
export const MAX_GLB_ZIP_FILES = 128;
const MAX_GLB_BYTES = 24 * 1024 * 1024;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export type GlbZipDirectoryEntry = Readonly<{
  archivePath: string;
  fileName: string;
  purpose: GlbImportPurpose;
  compressionMethod: 0 | 8;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
  dataOffset: number;
}>;

export type PreparedGlbZipEntry = Readonly<{
  entry: GlbZipDirectoryEntry;
  displayName: string;
  purpose: GlbImportPurpose;
  familyName: string;
  lodLevel: GlbLodLevel | null;
  plan: ReturnType<typeof buildGlbImportPlan>;
}>;

export type PreparedGlbZipBatch = Readonly<{
  archiveSha256: string;
  fallbackPurpose: GlbImportPurpose;
  entries: readonly PreparedGlbZipEntry[];
  familyCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
}>;

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

function fail(code: string): never { throw new Error(code); }
function safeUInt32(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) fail(code);
  return value;
}
function purpose(value: string | undefined, fallback: GlbImportPurpose): GlbImportPurpose {
  if (!value) return fallback;
  if (!(glbImportPurposes as readonly string[]).includes(value)) fail("GLB_ZIP_PURPOSE_INVALID");
  return value as GlbImportPurpose;
}
function displayName(fileName: string): string {
  const value = fileName.replace(/\.glb$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (value.length < 3 || /[<>]/.test(value)) fail("GLB_ZIP_DISPLAY_NAME_INVALID");
  return value;
}
function parseArchivePath(raw: string, fallbackPurpose: GlbImportPurpose): Readonly<{ archivePath: string; fileName: string; purpose: GlbImportPurpose }> {
  if (!raw || raw.includes("\0") || raw.includes("\\") || raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) fail("GLB_ZIP_PATH_INVALID");
  const parts = raw.split("/").filter(Boolean);
  if (parts.some(part => part === "." || part === "..")) fail("GLB_ZIP_PATH_INVALID");
  if (parts.length !== 1 && parts.length !== 2) fail("GLB_ZIP_PATH_INVALID");
  const fileName = parts.at(-1)!;
  if (fileName.length < 5 || fileName.length > 180 || !/^[^/\\<>:"|?*]+\.glb$/i.test(fileName)) fail("GLB_ZIP_GLB_NAME_REQUIRED");
  return Object.freeze({ archivePath: raw, fileName, purpose: purpose(parts.length === 2 ? parts[0] : undefined, fallbackPurpose) });
}
function findEocd(archive: Buffer): number {
  if (archive.length < 22 || archive.length > MAX_GLB_ZIP_BYTES) fail("GLB_ZIP_SIZE_INVALID");
  const minimum = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === archive.length) return offset;
  }
  fail("GLB_ZIP_EOCD_MISSING");
}

export function readGlbZipDirectory(archive: Buffer, fallbackPurpose: GlbImportPurpose = "auto"): readonly GlbZipDirectoryEntry[] {
  const eocd = findEocd(archive);
  const disk = archive.readUInt16LE(eocd + 4);
  const centralDisk = archive.readUInt16LE(eocd + 6);
  const entriesOnDisk = archive.readUInt16LE(eocd + 8);
  const entryCount = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) fail("GLB_ZIP_MULTIDISK_UNSUPPORTED");
  if (entryCount < 1 || entryCount > MAX_GLB_ZIP_FILES) fail("GLB_ZIP_ENTRY_LIMIT");
  if (centralOffset === 0xffffffff || centralSize === 0xffffffff || centralOffset + centralSize > eocd) fail("GLB_ZIP64_UNSUPPORTED");

  const entries: GlbZipDirectoryEntry[] = [];
  const seenPaths = new Set<string>();
  let totalUncompressed = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || archive.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) fail("GLB_ZIP_CENTRAL_INVALID");
    const madeBy = archive.readUInt16LE(cursor + 4);
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const expectedCrc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const diskStart = archive.readUInt16LE(cursor + 34);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > eocd || diskStart !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) fail("GLB_ZIP64_UNSUPPORTED");
    if (flags & 0x1) fail("GLB_ZIP_ENCRYPTION_UNSUPPORTED");
    if (method !== 0 && method !== 8) fail("GLB_ZIP_COMPRESSION_UNSUPPORTED");
    const rawName = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (rawName.includes("�")) fail("GLB_ZIP_FILENAME_ENCODING_INVALID");
    const unixMode = (madeBy >>> 8) === 3 ? (externalAttributes >>> 16) & 0xffff : 0;
    if ((unixMode & 0xf000) === 0xa000) fail("GLB_ZIP_SYMLINK_FORBIDDEN");
    cursor = end;
    if (rawName.endsWith("/")) continue;

    const routed = parseArchivePath(rawName, fallbackPurpose);
    const pathKey = routed.archivePath.toLocaleLowerCase("en-US");
    if (seenPaths.has(pathKey)) fail("GLB_ZIP_DUPLICATE_PATH");
    seenPaths.add(pathKey);
    if (uncompressedSize < 12 || uncompressedSize > MAX_GLB_BYTES) fail("GLB_ZIP_GLB_SIZE_INVALID");
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_GLB_ZIP_UNCOMPRESSED_BYTES) fail("GLB_ZIP_UNCOMPRESSED_LIMIT");
    if (localHeaderOffset + 30 > centralOffset || archive.readUInt32LE(localHeaderOffset) !== LOCAL_SIGNATURE) fail("GLB_ZIP_LOCAL_HEADER_INVALID");
    const localMethod = archive.readUInt16LE(localHeaderOffset + 8);
    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (localMethod !== method || dataOffset + compressedSize > centralOffset) fail("GLB_ZIP_ENTRY_BOUNDS");
    entries.push(Object.freeze({
      ...routed,
      compressionMethod: method as 0 | 8,
      compressedSize: safeUInt32(compressedSize, "GLB_ZIP_ENTRY_BOUNDS"),
      uncompressedSize: safeUInt32(uncompressedSize, "GLB_ZIP_ENTRY_BOUNDS"),
      crc32: expectedCrc >>> 0,
      localHeaderOffset,
      dataOffset,
    }));
  }
  if (cursor !== centralOffset + centralSize || !entries.length || entries.length > MAX_GLB_ZIP_FILES) fail("GLB_ZIP_CENTRAL_INVALID");
  return Object.freeze(entries.sort((left, right) => left.archivePath.localeCompare(right.archivePath)));
}

export function extractGlbZipEntry(archive: Buffer, entry: GlbZipDirectoryEntry): Buffer {
  const compressed = archive.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  let bytes: Buffer;
  try {
    bytes = entry.compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_GLB_BYTES + 1 });
  } catch { fail("GLB_ZIP_DEFLATE_INVALID"); }
  if (bytes.length !== entry.uncompressedSize || bytes.length > MAX_GLB_BYTES) fail("GLB_ZIP_SIZE_MISMATCH");
  if (crc32(bytes) !== entry.crc32) fail("GLB_ZIP_CRC_MISMATCH");
  return bytes;
}

export function prepareGlbZipBatch(archive: Buffer, fallbackPurpose: GlbImportPurpose = "auto"): PreparedGlbZipBatch {
  const directory = readGlbZipDirectory(archive, fallbackPurpose);
  const prepared: PreparedGlbZipEntry[] = [];
  const familyLevels = new Map<string, Set<number>>();
  const familyClassifications = new Map<string, string>();
  const logicalFamilies = new Set<string>();
  let uncompressedBytes = 0;

  for (const entry of directory) {
    const bytes = extractGlbZipEntry(archive, entry);
    const name = displayName(entry.fileName);
    const descriptor = glbLodDescriptor(name);
    const familyName = descriptor.baseDisplayName.trim();
    const familyKey = `${entry.purpose}\u0000${familyName.toLocaleLowerCase("en-US")}`;
    const plan = buildGlbImportPlan(bytes.toString("base64"), entry.purpose, entry.fileName);
    const classificationKey = JSON.stringify([
      plan.assetType,
      plan.classification.subcategory,
      plan.classification.equipmentSlot,
      plan.classification.worldFamily,
      plan.classification.rigContract,
    ]);
    const reference = familyClassifications.get(familyKey);
    if (reference && reference !== classificationKey) fail("GLB_ZIP_LOD_FAMILY_CLASSIFICATION_MISMATCH");
    familyClassifications.set(familyKey, classificationKey);
    if (descriptor.lodLevel !== null) {
      const levels = familyLevels.get(familyKey) ?? new Set<number>();
      if (levels.has(descriptor.lodLevel)) fail("GLB_ZIP_DUPLICATE_LOD");
      levels.add(descriptor.lodLevel);
      familyLevels.set(familyKey, levels);
    }
    logicalFamilies.add(familyKey);
    uncompressedBytes += bytes.length;
    prepared.push(Object.freeze({ entry, displayName: name, purpose: entry.purpose, familyName, lodLevel: descriptor.lodLevel, plan }));
  }

  return Object.freeze({
    archiveSha256: createHash("sha256").update(archive).digest("hex"),
    fallbackPurpose,
    entries: Object.freeze(prepared),
    familyCount: logicalFamilies.size,
    compressedBytes: archive.length,
    uncompressedBytes,
  });
}
