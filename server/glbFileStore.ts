import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, link, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_GLB_BYTES } from "./adminProtocol";

export function glbStorageRoot(): string {
  const root = process.env.AURION_GLB_STORAGE_DIR;
  if (!root || !path.isAbsolute(root)) throw new Error("GLB_STORAGE_NOT_CONFIGURED");
  return path.resolve(root);
}

function assetPath(root: string, sha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("GLB_DIGEST_INVALID");
  return path.join(root, `${sha256}.glb`);
}

/** Immutable, content-addressed bytes. DB approval controls public visibility. */
export async function readStoredGlb(sha256: string, root = glbStorageRoot()): Promise<Buffer> {
  const file = await open(assetPath(root, sha256), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 12 || info.size > MAX_GLB_BYTES) throw new Error("GLB_STORED_SIZE_INVALID");
    const bytes = await file.readFile();
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("GLB_STORED_DIGEST_MISMATCH");
    return bytes;
  } finally { await file.close(); }
}

export async function persistGlbBytes(bytes: Buffer, sha256: string, root = glbStorageRoot()) {
  if (bytes.length < 12 || bytes.length > MAX_GLB_BYTES || createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("GLB_DIGEST_INVALID");
  await mkdir(root, { recursive: true, mode: 0o750 });
  const destination = assetPath(root, sha256);
  const temporary = path.join(root, `.intake-${randomUUID()}`);
  const file = await open(temporary, "wx", 0o640);
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally { await file.close(); }
    // link is atomic and refuses to replace an existing immutable object.
    await link(temporary, destination).catch(error => { if (error.code !== "EEXIST") throw error; });
    const directory = await open(root, constants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
    await readStoredGlb(sha256, root);
  } finally { await unlink(temporary).catch(() => undefined); }
  return { key: `local-glb/${sha256}.glb`, url: `/api/assets/glb/${sha256}.glb` };
}

export async function checkGlbStorage(root = glbStorageRoot()) {
  await mkdir(root, { recursive: true, mode: 0o750 });
  if (!(await stat(root)).isDirectory()) throw new Error("GLB_STORAGE_UNAVAILABLE");
  const probe = path.join(root, `.probe-${randomUUID()}`);
  const file = await open(probe, "wx", 0o600);
  try { await file.writeFile("aurion-storage-probe"); await file.sync(); }
  finally { await file.close(); await unlink(probe); }
  return { configured: true as const, writable: true as const, provider: "aurion-volume" as const };
}
