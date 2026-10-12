import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyDiagnosticSource } from "../scripts/verify-aurion-journal-diagnostic-source.mjs";

const expected = "a".repeat(40), prepared = "b".repeat(40), drizzle = "c".repeat(40);
const env = { GITHUB_REPOSITORY: "OuroborosCollective/Echoes_of_Aurion", GITHUB_REF: "refs/heads/main",
  GITHUB_SHA: expected, EXPECTED_SHA: expected, PREPARED_SHA: prepared, ARTIFACT_RUN_ID: "123", GH_TOKEN: "PRIVATE_SENTINEL" };
const local = { head: expected, drizzle };
function responses(head = expected, tree = drizzle) {
  return [{ object: { sha: head } }, { tree: { sha: "d".repeat(40) } },
    { tree: [{ path: "drizzle", type: "tree", sha: tree }], truncated: false },
    { id: 123, head_sha: prepared, head_branch: "main", event: "workflow_dispatch",
      path: ".github/workflows/deploy-aurion-zone-runtime.yml", repository: { id: 1313103794, owner: { id: 266194342 } } }];
}
function requestFor(values = responses()) {
  const calls: any[] = [];
  return { calls, request: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => values[calls.length - 1] };
  } };
}

describe("journal diagnostic source binding without GitHub CLI", () => {
  it("reads only fixed GitHub paths with the workflow token and validates source identities", async () => {
    const r = requestFor();
    await expect(verifyDiagnosticSource(env, local, r.request)).resolves.toEqual({ sourceRevision: expected, preparedRevision: prepared, sourceRunId: 123 });
    expect(r.calls).toHaveLength(4);
    for (const c of r.calls) {
      expect(c.url).toMatch(/^https:\/\/api.github.com\/repos\/OuroborosCollective\/Echoes_of_Aurion\//);
      expect(c.url).not.toContain(env.GH_TOKEN);
      expect(c.options).toMatchObject({ method: "GET", redirect: "error", headers: { Authorization: `Bearer ${env.GH_TOKEN}` } });
    }
  });
  it("rejects invalid local inputs before making network requests", async () => {
    for (const bad of [{ GITHUB_REF: "refs/heads/other" }, { GITHUB_REPOSITORY: "other/repo" },
      { GITHUB_SHA: prepared }, { PREPARED_SHA: "../private" }, { ARTIFACT_RUN_ID: "123/other" },
      { ARTIFACT_RUN_ID: "9007199254740993" }, { GH_TOKEN: "" }]) {
      const r = requestFor();
      await expect(verifyDiagnosticSource({ ...env, ...bad }, local, r.request)).rejects.toThrow("DIAGNOSTIC_ARTIFACT_SOURCE_INVALID");
      expect(r.calls).toHaveLength(0);
    }
  });
  it("rejects moved main, changed Drizzle trees, ambiguous and truncated trees", async () => {
    const variants = [responses(prepared), responses(expected, prepared), responses(), responses()];
    variants[2][2].tree.push({ path: "drizzle", type: "tree", sha: drizzle });
    variants[3][2].truncated = true;
    for (const values of variants) await expect(verifyDiagnosticSource(env, local, requestFor(values).request)).rejects.toThrow("DIAGNOSTIC_ARTIFACT_SOURCE_INVALID");
  });
  it("rejects foreign or unrelated source release runs", async () => {
    for (const change of [{ id: 124 }, { head_sha: expected }, { head_branch: "other" }, { event: "push" },
      { path: ".github/workflows/unrelated.yml" }, { repository: { id: 1, owner: { id: 266194342 } } },
      { repository: { id: 1313103794, owner: { id: 1 } } }]) {
      const values = responses();
      values[3] = { ...values[3], ...change };
      await expect(verifyDiagnosticSource(env, local, requestFor(values).request)).rejects.toThrow("DIAGNOSTIC_ARTIFACT_SOURCE_INVALID");
    }
  });
  it("hides network, provider and JSON error details including private values", async () => {
    for (const request of [async () => { throw new Error(env.GH_TOKEN); },
      async () => ({ ok: false, json: async () => { throw new Error(env.GH_TOKEN); } }),
      async () => ({ ok: true, json: async () => { throw new Error(env.GH_TOKEN); } })]) {
      await expect(verifyDiagnosticSource(env, local, request)).rejects.toThrow(/^DIAGNOSTIC_GITHUB_READ_FAILED$/);
    }
  });
  it("executes the workflow helper with node and git available but no gh executable", () => {
    const temp = mkdtempSync(join(tmpdir(), "aurion-journal-source-"));
    try {
      const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      const tree = execFileSync("git", ["rev-parse", "HEAD:drizzle"], { encoding: "utf8" }).trim();
      symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(temp, "git"));
      const preload = join(temp, "mock-fetch.mjs");
      writeFileSync(preload, `const values=${JSON.stringify(responses(head, tree))};globalThis.fetch=async()=>({ok:true,json:async()=>values.shift()});`);
      const result = spawnSync(process.execPath, ["--import", preload, resolve("scripts/verify-aurion-journal-diagnostic-source.mjs")], {
        encoding: "utf8", env: { ...process.env, ...env, PATH: temp, EXPECTED_SHA: head, GITHUB_SHA: head },
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({ sourceRevision: head, preparedRevision: prepared, sourceRunId: 123 });
      expect(result.stdout).not.toContain(env.GH_TOKEN);
      const workflow = readFileSync(".github/workflows/aurion-schema-repair-journal-diagnostic.yml", "utf8");
      expect(workflow).toContain("node scripts/verify-aurion-journal-diagnostic-source.mjs");
      expect(workflow).not.toMatch(/\bgh\s+api\b/);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});
