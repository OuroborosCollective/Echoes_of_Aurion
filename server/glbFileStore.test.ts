import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { persistGlbBytes, readStoredGlb, checkGlbStorage } from "./glbFileStore";
import { testGlb } from "./glbImportFixtures";

describe("durable immutable GLB files", () => {
  it("survives concurrent ingestion and a fresh reader without replacing bytes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "aurion-glb-"));
    try {
      const bytes = testGlb(); const hash = createHash("sha256").update(bytes).digest("hex");
      await expect(checkGlbStorage(root)).resolves.toMatchObject({ writable: true });
      const stored = await Promise.all(Array.from({ length: 4 }, () => persistGlbBytes(bytes, hash, root)));
      expect(new Set(stored.map(file => file.url)).size).toBe(1);
      expect(await readStoredGlb(hash, root)).toEqual(bytes);
      expect(await readdir(root)).toEqual([`${hash}.glb`]);
      await writeFile(path.join(root, `${hash}.glb`), Buffer.alloc(bytes.length));
      await expect(persistGlbBytes(bytes, hash, root)).rejects.toThrow("GLB_STORED_DIGEST_MISMATCH");
      await expect(readStoredGlb("../file", root)).rejects.toThrow("GLB_DIGEST_INVALID");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
