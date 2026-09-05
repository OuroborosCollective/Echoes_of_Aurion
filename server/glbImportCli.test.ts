import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { testGlb } from "./glbImportFixtures";
import { buildGlbImportPlan } from "./glbImportPlan";
// The shipped Node CLI is exercised directly, including disk reads and payload binding.
// @ts-ignore JavaScript CLI has no separate declaration file.
import { importAsset, readAsset } from "../scripts/glb-import.mjs";

describe("agent GLB import client", () => {
  it("binds plan/apply to actual file bytes, keeps dry runs read-only, and rejects server drift and symlinks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "glb-cli-"));
    try {
      const file = path.join(root, "spear.glb"), bytes = testGlb(); await writeFile(file, bytes);
      const plan = buildGlbImportPlan(bytes.toString("base64"));
      const calls: string[] = [];
      const fetcher = async (url: string, init: RequestInit) => {
        calls.push(url); expect(init.redirect).toBe("error");
        expect(init.headers).toMatchObject({ Authorization: "Bearer isolated-test-token" });
        const body = JSON.parse(String(init.body)); expect(body.contentBase64).toBe(bytes.toString("base64"));
        if (url.endsWith('/plan')) return { ok: true, json: async () => plan };
        expect(body.expectedPlanSha256).toBe(plan.planSha256);
        return { ok: true, json: async () => ({ ...plan, status: 'assigned' }) };
      };
      await importAsset(file, "isolated-test-token", { dryRun: true, fetcher }); expect(calls).toHaveLength(1);
      await importAsset(file, "isolated-test-token", { fetcher }); expect(calls).toHaveLength(3);
      await expect(importAsset(file, "isolated-test-token", { fetcher: async () => ({ ok: true, json: async () => ({ ...plan, sha256: '0'.repeat(64) }) }) })).rejects.toThrow('GLB_PLAN_READBACK_FAILED');
      const link = path.join(root, 'link.glb'); await symlink(file, link); await expect(readAsset(link)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
