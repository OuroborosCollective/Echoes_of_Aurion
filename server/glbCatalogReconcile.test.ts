import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateGlbStructure, findOrphanedGlbFiles, removeOrphanedGlbFiles } from "./glbCatalogReconcile";
import { testGlb } from "./glbImportFixtures";

describe("GLB catalog reconcile helpers", () => {
  describe("validateGlbStructure", () => {
    it("accepts a well-formed GLB", () => {
      expect(() => validateGlbStructure(testGlb())).not.toThrow();
    });

    it("rejects a truncated buffer", () => {
      expect(() => validateGlbStructure(Buffer.alloc(8))).toThrow("GLB_STRUCTURE_TOO_SHORT");
    });

    it("rejects a bad magic signature", () => {
      const bytes = testGlb();
      bytes[0] = 0x58; // corrupt "g"
      expect(() => validateGlbStructure(bytes)).toThrow("GLB_MAGIC_INVALID");
    });

    it("rejects a wrong version", () => {
      const bytes = testGlb();
      bytes.writeUInt32LE(1, 4);
      expect(() => validateGlbStructure(bytes)).toThrow("GLB_VERSION_INVALID");
    });

    it("rejects a length mismatch", () => {
      const bytes = testGlb();
      bytes.writeUInt32LE(bytes.length + 100, 8);
      expect(() => validateGlbStructure(bytes)).toThrow("GLB_LENGTH_MISMATCH");
    });

    it("rejects a corrupt JSON chunk", () => {
      const bytes = testGlb();
      // Overwrite the first byte of the JSON chunk data (offset 20) to break JSON.
      bytes[20] = 0x5e;
      expect(() => validateGlbStructure(bytes)).toThrow("GLB_JSON_CHUNK_INVALID");
    });
  });

  describe("findOrphanedGlbFiles", () => {
    it("returns only files whose SHA-256 is not in the known set", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "aurion-glb-reconcile-"));
      try {
        const known = createHash("sha256").update("known").digest("hex");
        const orphan = createHash("sha256").update("orphan").digest("hex");
        const nonContentAddressed = "not-a-hash.glb";
        await writeFile(path.join(root, `${known}.glb`), "known");
        await writeFile(path.join(root, `${orphan}.glb`), "orphan");
        await writeFile(path.join(root, nonContentAddressed), "junk");

        const result = await findOrphanedGlbFiles(root, new Set([known]));
        expect(result).toEqual([path.join(root, `${orphan}.glb`)]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("removeOrphanedGlbFiles", () => {
    it("removes orphaned files and keeps known ones", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "aurion-glb-reconcile-"));
      try {
        const known = createHash("sha256").update("known").digest("hex");
        const orphan = createHash("sha256").update("orphan").digest("hex");
        await writeFile(path.join(root, `${known}.glb`), "known");
        await writeFile(path.join(root, `${orphan}.glb`), "orphan");

        const removed = await removeOrphanedGlbFiles(root, new Set([known]));
        expect(removed).toEqual([path.join(root, `${orphan}.glb`)]);

        const { readdir } = await import("node:fs/promises");
        const remaining = await readdir(root);
        expect(remaining).toEqual([`${known}.glb`]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });
});
