import { readdir, unlink } from "node:fs/promises";
import path from "node:path";

const GLB_MAGIC = "glTF";
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON" little-endian

/**
 * Validates the binary structure of a GLB buffer beyond a mere digest match:
 * magic bytes, version, declared total length, well-formed chunk table, and
 * at least one parseable JSON chunk. Throws a `GLB_STRUCTURE_*` error on any
 * structural defect, so the reconciler can treat the asset as corrupt even
 * when the content-addressed digest still matches (e.g. filesystem-level
 * tampering or a file that bypassed upload-time validation).
 */
export function validateGlbStructure(bytes: Buffer): void {
  if (bytes.length < 20) throw new Error("GLB_STRUCTURE_TOO_SHORT");
  if (bytes.subarray(0, 4).toString("ascii") !== GLB_MAGIC) throw new Error("GLB_MAGIC_INVALID");
  if (bytes.readUInt32LE(4) !== GLB_VERSION) throw new Error("GLB_VERSION_INVALID");
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error("GLB_LENGTH_MISMATCH");

  let offset = 12;
  let foundJson = false;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const dataEnd = offset + 8 + chunkLength;
    if (dataEnd > bytes.length) throw new Error("GLB_CHUNK_OVERFLOW");
    if (chunkType === JSON_CHUNK_TYPE) {
      foundJson = true;
      const raw = bytes.subarray(offset + 8, dataEnd).toString("utf8").replace(/\u0000+$/, "");
      try {
        JSON.parse(raw);
      } catch {
        throw new Error("GLB_JSON_CHUNK_INVALID");
      }
    }
    offset = dataEnd;
  }
  if (offset !== bytes.length) throw new Error("GLB_CHUNK_TRAILING_BYTES");
  if (!foundJson) throw new Error("GLB_JSON_CHUNK_MISSING");
}

/**
 * Scans a GLB storage root for content-addressed `.glb` files whose SHA-256
 * filename has no corresponding database record. Returns the absolute paths
 * of orphaned files without removing them.
 */
export async function findOrphanedGlbFiles(
  root: string,
  knownSha256s: ReadonlySet<string>,
): Promise<readonly string[]> {
  const entries = await readdir(root);
  const orphans: string[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".glb")) continue;
    const sha256 = entry.slice(0, -4);
    if (!/^[a-f0-9]{64}$/.test(sha256)) continue;
    if (!knownSha256s.has(sha256)) orphans.push(path.join(root, entry));
  }
  return Object.freeze(orphans);
}

/**
 * Removes orphaned content-addressed GLB files from the storage root — files
 * whose SHA-256 has no database record. Returns the list of removed paths.
 */
export async function removeOrphanedGlbFiles(
  root: string,
  knownSha256s: ReadonlySet<string>,
): Promise<readonly string[]> {
  const orphans = await findOrphanedGlbFiles(root, knownSha256s);
  for (const file of orphans) {
    await unlink(file);
  }
  return orphans;
}
