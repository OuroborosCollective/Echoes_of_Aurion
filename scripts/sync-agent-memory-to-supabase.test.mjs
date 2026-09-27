import assert from "node:assert/strict";
import { syncMemory, sha256, gitBlobSha1 } from "./sync-agent-memory-to-supabase.mjs";

const memory = "# Memory.md\n\n### 2026-09-27 — test snapshot\nStatus: VERIFIED\n";
const workspace = {
  id: "workspace-1",
  name: "Echoes_of_Aurion Agent Memory",
  slug: "echoes-of-aurion-agent-memory",
};
const repositoryRow = {
  id: "repo-1",
  github_repo_id: 1313103794,
  full_name: "OuroborosCollective/Echoes_of_Aurion",
  default_branch: "main",
};

function fakeFetchFactory({ existingEntry = null } = {}) {
  const calls = [];
  const storedMemory = {
    id: existingEntry?.id ?? "memory-1",
    workspace_id: workspace.id,
    content: existingEntry?.content ?? memory,
    metadata: existingEntry?.metadata ?? {
      source_blob_sha: gitBlobSha1(memory),
      content_sha256: sha256(memory),
    },
  };
  const storedHistory = {
    id: "history-1",
    status: "verified",
    content_hash: sha256(memory),
    evidence: {
      source_blob_sha: gitBlobSha1(memory),
      memory_entry_id: storedMemory.id,
    },
  };

  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method ?? "GET",
      body: options.body ?? null,
      authorization: options.headers?.Authorization ?? options.headers?.authorization ?? null,
      apikey: options.headers?.apikey ?? options.headers?.Apikey ?? null,
    });
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;
    const method = options.method ?? "GET";

    if (path.startsWith("/rest/v1/memory_workspaces?")) return response([workspace]);
    if (path.startsWith("/rest/v1/github_repositories?")) return response([repositoryRow]);
    if (path === "/rest/v1/memory_entries" && method === "POST") return response([storedMemory]);
    if (path.startsWith("/rest/v1/memory_entries?") && path.includes("source_blob_sha")) {
      return response(existingEntry ? [storedMemory] : []);
    }
    if (path === "/rest/v1/agent_sessions" && method === "POST") return response([{ id: "session-1" }]);
    if (path === "/rest/v1/agent_events" && method === "POST") return response([{ id: "event-1" }]);
    if (path === "/rest/v1/agent_readback_history" && method === "POST") return response([storedHistory]);
    if (path.startsWith("/rest/v1/memory_entries?") && path.includes("id=eq.")) return response([storedMemory]);
    if (path.startsWith("/rest/v1/agent_readback_history?") && path.includes("id=eq.")) return response([storedHistory]);
    if (path.startsWith("/rest/v1/agent_sessions?") && method === "PATCH") return emptyResponse();

    throw new Error("unexpected request: " + method + " " + path);
  };

  return { fetchImpl, calls };
}

function response(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    async json() {
      return value;
    },
  };
}

function emptyResponse() {
  return {
    ok: true,
    status: 204,
    statusText: "No Content",
    async json() {
      return null;
    },
  };
}

const env = {
  SUPABASE_URL: "https://ggwyphkhxnzurregdkql.supabase.co",
  SUPABASE_API_KEY: "sb_secret_test-only",
  GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
  GITHUB_REF_NAME: "main",
  GITHUB_REPOSITORY: "OuroborosCollective/Echoes_of_Aurion",
  GITHUB_RUN_ID: "123",
};

{
  const { fetchImpl, calls } = fakeFetchFactory();
  const result = await syncMemory({ content: memory, env, fetchImpl });
  assert.equal(result.memoryChanged, true);
  assert.equal(result.contentSha256, sha256(memory));
  assert.equal(result.sourceBlobSha, gitBlobSha1(memory));
  assert.ok(
    calls.some(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/rest/v1/memory_entries"),
    ),
  );
  assert.ok(calls.every((call) => call.authorization === null));
  assert.ok(calls.every((call) => call.apikey === "sb_secret_test-only"));
}

{
  const existingEntry = {
    id: "memory-1",
    content: memory,
    metadata: {
      source_blob_sha: gitBlobSha1(memory),
      content_sha256: sha256(memory),
    },
  };
  const { fetchImpl, calls } = fakeFetchFactory({ existingEntry });
  const result = await syncMemory({ content: memory, env, fetchImpl });
  assert.equal(result.memoryChanged, false);
  assert.equal(
    calls.filter(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/rest/v1/memory_entries"),
    ).length,
    0,
  );
  assert.ok(
    calls.some(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/rest/v1/agent_readback_history"),
    ),
  );
}

assert.notEqual(gitBlobSha1(memory), sha256(memory));
console.log("agent memory sync regression: PASS");

{
  const existingEntry = {
    id: "memory-legacy",
    content: memory,
    metadata: {
      source_blob_sha: gitBlobSha1(memory),
      content_sha256: sha256(memory),
    },
  };
  const legacyEnv = {
    ...env,
    SUPABASE_API_KEY: "eyJhbGciOiJub25lIn0.legacy-service-role-test",
  };
  const { fetchImpl, calls } = fakeFetchFactory({ existingEntry });
  await syncMemory({ content: memory, env: legacyEnv, fetchImpl });
  assert.ok(calls.every((call) => call.authorization === "Bearer eyJhbGciOiJub25lIn0.legacy-service-role-test"));
  assert.ok(calls.every((call) => call.apikey === "eyJhbGciOiJub25lIn0.legacy-service-role-test"));
}
