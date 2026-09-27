import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const DEFAULT_SUPABASE_URL = "https://ggwyphkhxnzurregdkql.supabase.co";
const DEFAULT_WORKSPACE_SLUG = "echoes-of-aurion-agent-memory";
const DEFAULT_REPOSITORY = "OuroborosCollective/Echoes_of_Aurion";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function gitBlobSha1(value) {
  const bytes = Buffer.from(value, "utf8");
  return createHash("sha1")
    .update(Buffer.from("blob " + bytes.byteLength + "\0"))
    .update(bytes)
    .digest("hex");
}

function requireNonEmpty(value, name) {
  if (!value || !String(value).trim()) {
    throw new Error(name + " is required");
  }
  return String(value).trim();
}

async function requestJson(fetchImpl, baseUrl, apiKey, path, options = {}) {
  const response = await fetchImpl(new URL(path, baseUrl), {
    ...options,
    headers: {
      apikey: apiKey,
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error("Supabase request failed: " + response.status + " " + response.statusText);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function getOne(fetchImpl, baseUrl, apiKey, path, label) {
  const rows = await requestJson(fetchImpl, baseUrl, apiKey, path);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(label + " readback expected exactly one row");
  }
  return rows[0];
}

export async function syncMemory({
  content,
  env = process.env,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("global fetch is unavailable");
  }

  const supabaseUrl = requireNonEmpty(
    env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
    "SUPABASE_URL",
  ).replace(/\/$/, "");
  const apiKey = requireNonEmpty(env.SUPABASE_API_KEY, "SUPABASE_API_KEY");
  const workspaceSlug =
    env.SUPABASE_MEMORY_WORKSPACE_SLUG ?? DEFAULT_WORKSPACE_SLUG;
  const repository = env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;
  const revision = requireNonEmpty(
    env.GITHUB_SHA ?? "local-unbound",
    "GITHUB_SHA",
  );
  const branch = env.GITHUB_REF_NAME ?? "unknown";
  const workflowRunId = env.GITHUB_RUN_ID ?? null;

  if (!content || !content.trim()) {
    throw new Error("Memory.md is empty");
  }

  const contentHash = sha256(content);
  const blobSha = gitBlobSha1(content);
  const contentBytes = Buffer.byteLength(content, "utf8");

  const workspacePath =
    "/rest/v1/memory_workspaces?select=id,name,slug&slug=eq." +
    encodeURIComponent(workspaceSlug) +
    "&limit=1";
  const workspace = await getOne(
    fetchImpl,
    supabaseUrl,
    apiKey,
    workspacePath,
    "workspace",
  );

  const repositoryPath =
    "/rest/v1/github_repositories?select=id,github_repo_id,full_name,default_branch&workspace_id=eq." +
    encodeURIComponent(workspace.id) +
    "&full_name=eq." +
    encodeURIComponent(repository) +
    "&limit=1";
  const repositoryRows = await requestJson(
    fetchImpl,
    supabaseUrl,
    apiKey,
    repositoryPath,
  );
  const repositoryRow = repositoryRows?.[0] ?? null;

  if (!repositoryRow) {
    throw new Error("GitHub repository is not registered in the agent-memory workspace");
  }

  const existingEntryPath =
    "/rest/v1/memory_entries?select=id,workspace_id,title,metadata&workspace_id=eq." +
    encodeURIComponent(workspace.id) +
    "&source_type=eq.github&metadata-%3E%3Esource_blob_sha=eq." +
    encodeURIComponent(blobSha) +
    "&limit=1";
  const existingEntries = await requestJson(
    fetchImpl,
    supabaseUrl,
    apiKey,
    existingEntryPath,
  );
  const existingEntry = existingEntries?.[0] ?? null;

  const sourceRef = repository + "@" + revision + ":Memory.md@" + blobSha;
  let memoryEntry;
  let memoryChanged = false;

  if (existingEntry) {
    memoryEntry = existingEntry;
  } else {
    memoryChanged = true;
    const insertBody = {
      workspace_id: workspace.id,
      entry_type: "summary",
      title: "Memory.md — Echoes of Aurion (automated snapshot)",
      content,
      tags: ["Memory.md", "project-memory", "agent-memory", "readback"],
      source_type: "github",
      source_ref: sourceRef,
      importance: 5,
      metadata: {
        source_repository: repository,
        source_path: "Memory.md",
        source_revision: revision,
        source_blob_sha: blobSha,
        content_sha256: contentHash,
        content_bytes: contentBytes,
        authority: "agent-working-memory-only",
        gameplay_truth_authority: "Aurion",
        sync_mode: "github-main-push",
      },
    };
    const inserted = await requestJson(
      fetchImpl,
      supabaseUrl,
      apiKey,
      "/rest/v1/memory_entries",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(insertBody),
      },
    );
    if (!Array.isArray(inserted) || inserted.length !== 1) {
      throw new Error("memory entry insert did not return exactly one row");
    }
    memoryEntry = inserted[0];
  }

  const sessions = await requestJson(
    fetchImpl,
    supabaseUrl,
    apiKey,
    "/rest/v1/agent_sessions",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        workspace_id: workspace.id,
        agent_name: "github-actions-memory-sync",
        client_name: "GitHub Actions",
        external_session_id: workflowRunId,
        title: "Memory sync " + revision.slice(0, 12),
        summary: memoryChanged
          ? "Imported a new Memory.md snapshot."
          : "Revalidated the already stored Memory.md snapshot.",
        repository_id: repositoryRow.id,
        branch_name: branch,
        metadata: {
          repository,
          revision,
          source_blob_sha: blobSha,
          content_sha256: contentHash,
          memory_entry_id: memoryEntry.id,
          memory_changed: memoryChanged,
        },
      }),
    },
  );
  if (!Array.isArray(sessions) || sessions.length !== 1) {
    throw new Error("agent session insert did not return exactly one row");
  }
  const session = sessions[0];

  const eventRows = await requestJson(
    fetchImpl,
    supabaseUrl,
    apiKey,
    "/rest/v1/agent_events",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        session_id: session.id,
        repository_id: repositoryRow.id,
        event_type: "memory_sync",
        summary: memoryChanged
          ? "Imported new canonical Memory.md snapshot into agent memory."
          : "Verified canonical Memory.md against existing agent-memory snapshot.",
        details: {
          source_ref: sourceRef,
          revision,
          source_blob_sha: blobSha,
          content_sha256: contentHash,
          content_bytes: contentBytes,
          memory_entry_id: memoryEntry.id,
          memory_changed: memoryChanged,
        },
        commit_sha: revision === "local-unbound" ? null : revision,
        source_url:
          "https://github.com/" +
          repository +
          "/blob/" +
          revision +
          "/Memory.md",
      }),
    },
  );
  if (!Array.isArray(eventRows) || eventRows.length !== 1) {
    throw new Error("agent event insert did not return exactly one row");
  }
  const event = eventRows[0];

  const historyRows = await requestJson(
    fetchImpl,
    supabaseUrl,
    apiKey,
    "/rest/v1/agent_readback_history",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        workspace_id: workspace.id,
        session_id: session.id,
        event_id: event.id,
        source_kind: "github",
        source_ref: sourceRef,
        status: "verified",
        summary: memoryChanged
          ? "Memory.md snapshot imported and independently read back."
          : "Memory.md snapshot revalidated against stored agent memory.",
        evidence: {
          source_repository: repository,
          source_revision: revision,
          source_blob_sha: blobSha,
          content_sha256: contentHash,
          content_bytes: contentBytes,
          memory_entry_id: memoryEntry.id,
          session_id: session.id,
          event_id: event.id,
          workflow_run_id: workflowRunId,
          branch,
          memory_changed: memoryChanged,
          gameplay_truth_authority: "Aurion",
        },
        content_hash: contentHash,
      }),
    },
  );
  if (!Array.isArray(historyRows) || historyRows.length !== 1) {
    throw new Error("readback history insert did not return exactly one row");
  }
  const history = historyRows[0];

  const storedEntry = await getOne(
    fetchImpl,
    supabaseUrl,
    apiKey,
    "/rest/v1/memory_entries?select=id,workspace_id,content,metadata&id=eq." +
      encodeURIComponent(memoryEntry.id) +
      "&limit=1",
    "memory entry",
  );

  const storedContentHash = sha256(storedEntry.content);
  if (
    storedContentHash !== contentHash ||
    storedEntry.workspace_id !== workspace.id ||
    storedEntry.metadata?.source_blob_sha !== blobSha ||
    storedEntry.metadata?.content_sha256 !== contentHash
  ) {
    throw new Error("memory entry readback hash or identity mismatch");
  }

  const storedHistory = await getOne(
    fetchImpl,
    supabaseUrl,
    apiKey,
    "/rest/v1/agent_readback_history?select=id,status,content_hash,evidence&id=eq." +
      encodeURIComponent(history.id) +
      "&limit=1",
    "readback history",
  );

  if (
    storedHistory.status !== "verified" ||
    storedHistory.content_hash !== contentHash ||
    storedHistory.evidence?.source_blob_sha !== blobSha ||
    storedHistory.evidence?.memory_entry_id !== memoryEntry.id
  ) {
    throw new Error("readback history identity mismatch");
  }

  await requestJson(
    fetchImpl,
    supabaseUrl,
    apiKey,
    "/rest/v1/agent_sessions?id=eq." + encodeURIComponent(session.id),
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        ended_at: new Date().toISOString(),
        summary: memoryChanged
          ? "Memory snapshot imported and read back successfully."
          : "Memory snapshot revalidated successfully.",
      }),
    },
  );

  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    repository,
    revision,
    branch,
    sourceBlobSha: blobSha,
    contentSha256: contentHash,
    contentBytes,
    memoryEntryId: memoryEntry.id,
    sessionId: session.id,
    eventId: event.id,
    historyId: history.id,
    memoryChanged,
  };
}

async function main() {
  const content = await readFile("Memory.md", "utf8");
  const result = await syncMemory({ content });
  console.log(
    JSON.stringify(
      {
        status: "verified",
        repository: result.repository,
        revision: result.revision,
        sourceBlobSha: result.sourceBlobSha,
        contentSha256: result.contentSha256,
        contentBytes: result.contentBytes,
        memoryChanged: result.memoryChanged,
        memoryEntryId: result.memoryEntryId,
        sessionId: result.sessionId,
        eventId: result.eventId,
        historyId: result.historyId,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === "file://" + process.argv[1]) {
  await main();
}
