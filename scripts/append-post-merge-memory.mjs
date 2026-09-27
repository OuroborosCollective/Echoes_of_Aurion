import { appendFile, readFile } from "node:fs/promises";

const DEFAULT_MEMORY_PATH = "Memory.md";
const DEFAULT_FILES_PATH = "merged-pr-files.txt";

function required(value, name) {
  if (!value || !String(value).trim()) throw new Error(name + " is required");
  return String(value).trim();
}

function redact(value) {
  return String(value ?? "")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/Bearer\\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/\\beyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b/g, "[REDACTED]");
}

function section(body, headings) {
  const source = String(body ?? "").replace(/\r/g, "");
  for (const heading of headings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
    const match = source.match(new RegExp("^##\\\\s+" + escaped + "\\\\s*$([\\\\s\\\\S]*?)(?=^##\\\\s+|\\\\Z)", "mi"));
    if (match?.[1]?.trim()) {
      return redact(match[1].trim()).replace(/^\\s*[-*]\\s+/gm, "- ").replace(/\\n{3,}/g, "\\n\\n").trim();
    }
  }
  return "";
}

function compact(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : fallback;
}

export function buildEntry({ mergedAt, mergeCommitSha, prNumber, prTitle, prHeadSha, prUrl, workflowRunId, files, body }) {
  const safePrNumber = required(prNumber, "PR_NUMBER");
  const title = compact(prTitle, "Merged change");
  const mergeSha = required(mergeCommitSha, "MERGE_COMMIT_SHA");
  const headSha = compact(prHeadSha, "unknown");
  const date = new Date(mergedAt || Date.now()).toISOString().slice(0, 10);
  const marker = "<!-- auto-memory: pr=" + safePrNumber + " merge=" + mergeSha + " -->";
  const decisions = compact(section(body, ["Decisions", "Boundary", "Architecture"]), "The merge was accepted through the repository's configured PR gates; Aurion remains the sole active gameplay/world/persistence authority.");
  const learned = compact(section(body, ["Learned", "Insight"]), "Repository memory is now recorded automatically from the completed merge instead of requiring a manual post-merge Memory.md edit.");
  const open = compact(section(body, ["Open", "Open points", "Open points / next"]), "Runtime, deployment and independent readback claims remain governed by their respective evidence lanes; this entry records the repository merge only.");
  const next = compact(section(body, ["Next safe step", "Next"]), "Use the new main revision as the canonical baseline for the next integration and require independent runtime/readback evidence where applicable.");
  const normalizedFiles = [...new Set((files ?? []).map((file) => String(file).trim()).filter(Boolean))].sort();
  const touched = normalizedFiles.length ? normalizedFiles.map((file) => "- `" + file + "`").join("\n") : "- Changed-file list unavailable from the merge event.";
  return [
    "",
    "",
    "### " + date + " — PR #" + safePrNumber + " — " + title,
    "Status: VERIFIED repository merge",
    marker,
    "Task: Merge PR #" + safePrNumber + " into `main` — " + title + ".",
    "Decisions: " + decisions.replace(/\n/g, " "),
    "Touched surfaces:",
    touched,
    "Evidence:",
    "- Pull request: " + compact(prUrl, "unavailable"),
    "- Merge commit: `" + mergeSha + "`",
    "- PR head: `" + headSha + "`",
    "- Merged at: " + (mergedAt || "unavailable"),
    "- Post-merge workflow run: " + compact(workflowRunId, "unavailable"),
    "Learned: " + learned.replace(/\n/g, " "),
    "Open: " + open.replace(/\n/g, " "),
    "Next safe step: " + next.replace(/\n/g, " "),
    ""
  ].join("\n");
}

export async function appendEntry({ memoryPath = DEFAULT_MEMORY_PATH, filesPath = DEFAULT_FILES_PATH, ...meta }) {
  const memory = await readFile(memoryPath, "utf8");
  const marker = "<!-- auto-memory: pr=" + required(meta.prNumber, "PR_NUMBER") + " merge=" + required(meta.mergeCommitSha, "MERGE_COMMIT_SHA") + " -->";
  if (memory.includes(marker)) return { changed: false, marker };
  const filesText = await readFile(filesPath, "utf8").catch(() => "");
  const files = filesText.split("\n").map((value) => value.trim()).filter(Boolean);
  const entry = buildEntry({ ...meta, files });
  await appendFile(memoryPath, entry, "utf8");
  return { changed: true, marker };
}

async function main() {
  const result = await appendEntry({
    memoryPath: process.env.MEMORY_PATH ?? DEFAULT_MEMORY_PATH,
    filesPath: process.env.MERGED_PR_FILES_PATH ?? DEFAULT_FILES_PATH,
    mergedAt: process.env.MERGED_AT,
    mergeCommitSha: required(process.env.MERGE_COMMIT_SHA, "MERGE_COMMIT_SHA"),
    prNumber: required(process.env.PR_NUMBER, "PR_NUMBER"),
    prTitle: process.env.PR_TITLE,
    prHeadSha: process.env.PR_HEAD_SHA,
    prUrl: process.env.PR_URL,
    workflowRunId: process.env.GITHUB_RUN_ID,
    body: process.env.PR_BODY,
  });
  console.log(JSON.stringify({ status: "verified", changed: result.changed, marker: result.marker }, null, 2));
}

if (import.meta.url === "file://" + process.argv[1]) await main();