import assert from "node:assert/strict";
import { appendEntry, buildEntry } from "./append-post-merge-memory.mjs";
import { requiresAurionRelease } from "./aurion-release-paths.mjs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const body = [
  "## Summary",
  "",
  "- Add automated memory recording.",
  "",
  "## Decisions",
  "",
  "- Keep GitHub Memory.md canonical.",
  "- Store only working-memory mirror data in Supabase.",
  "",
  "## Secret",
  "",
  "SUPABASE_SECRET_KEY must never be copied into Memory.md.",
  "",
  "## Learned",
  "",
  "- Automation removes a manual merge follow-up.",
  "",
  "## Open",
  "",
  "- Runtime readback remains a separate evidence concern.",
  "",
  "## Next safe step",
  "",
  "- Continue from the merged main revision.",
].join("\n");

const entry = buildEntry({
  mergedAt: "2026-09-27T18:00:00.000Z",
  mergeCommitSha: "a".repeat(40),
  prNumber: "629",
  prTitle: "Automate Memory.md agent-memory sync to Supabase",
  prHeadSha: "b".repeat(40),
  prUrl: "https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/629",
  workflowRunId: "123456",
  files: [".github/workflows/agent-memory-supabase-sync.yml", "Memory.md"],
  body,
});

assert.match(entry, /### 2026-09-27 — PR #629/);
assert.match(entry, /<!-- auto-memory: pr=629 merge=aaaaaaaa/);
assert.match(entry, /- `Memory\.md`/);
assert.match(entry, /Automation removes a manual merge follow-up/);
assert.doesNotMatch(entry, /SUPABASE_SECRET_KEY/);
assert.match(entry, /Runtime readback remains a separate evidence concern/);

const entry2 = buildEntry({
  mergedAt: "2026-09-27T18:00:00.000Z",
  mergeCommitSha: "b".repeat(40),
  prNumber: "630",
  prTitle: "",
  prHeadSha: "",
  prUrl: "",
  workflowRunId: "",
  files: [],
  body: "",
});

assert.ok(entry2.includes("Aurion remains the sole active gameplay/world/persistence authority"));
assert.match(entry2, /Changed-file list unavailable/);

console.log("post-merge memory entry regression: PASS");

const dir = await mkdtemp(path.join(os.tmpdir(), "aurion-memory-proof-"));
try {
  const memoryPath = path.join(dir, "Memory.md");
  const marker = "<!-- integration-memory: pr=830 -->";
  const entry = `### Integration\n${marker}\nStatus: Verified tests\nTask: Schema repair\nEvidence: CI run\nLearned: Bind revisions\nOpen: Production verification\n`;
  await writeFile(memoryPath, entry);
  const meta = { memoryPath, prNumber: "830", mergeCommitSha: "a".repeat(40) };
  assert.equal((await appendEntry(meta)).changed, false);
  assert.equal(await readFile(memoryPath, "utf8"), entry);
  await writeFile(memoryPath, marker);
  await assert.rejects(appendEntry(meta), /INTEGRATION_MEMORY_ENTRY_INVALID/);
  await writeFile(memoryPath, entry + entry);
  await assert.rejects(appendEntry(meta), /INTEGRATION_MEMORY_ENTRY_INVALID/);
} finally { await rm(dir, { recursive: true, force: true }); }
assert.equal(requiresAurionRelease(["docs/schema.md", "Memory.md"]), false);
assert.equal(requiresAurionRelease(["docs/schema.md", "server/router.ts"]), true);
assert.equal(requiresAurionRelease([".github/workflows/deploy-aurion-zone-runtime.yml"]), true);
assert.throws(() => requiresAurionRelease([]), /RELEASE_FILE_LIST_REQUIRED/);
