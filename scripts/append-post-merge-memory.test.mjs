import assert from "node:assert/strict";
import { buildEntry } from "./append-post-merge-memory.mjs";

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

assert.match(entry2, /Aurion remains the sole active gameplay\\/world\\/persistence authority/);
assert.match(entry2, /Changed-file list unavailable/);

console.log("post-merge memory entry regression: PASS");