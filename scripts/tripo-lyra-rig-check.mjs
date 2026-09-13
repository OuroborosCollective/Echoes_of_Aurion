import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MODEL = path.resolve(".game-dev/workspace/lyra-rig-proxy.glb");
const RECEIPT = path.resolve(".game-dev/workspace/lyra-rig-check.json");
const BASE = "https://openapi.tripo3d.ai/v3";
const apiKey = process.env.TRIPO_API_KEY?.trim();
if (!apiKey) throw new Error("TRIPO_API_KEY_MISSING");
if (/^Bearer\s+/i.test(apiKey)) throw new Error("TRIPO_SECRET_MUST_BE_RAW_API_KEY");
if (!apiKey.startsWith("tsk_")) throw new Error("TRIPO_API_KEY_PREFIX_INVALID");

async function envelope(response, context) {
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error(`TRIPO_${context}_NON_JSON_${response.status}`); }
  if (!response.ok || payload?.code !== 0 || !payload?.data) {
    throw new Error(`TRIPO_${context}_FAILED_${response.status}_${payload?.code ?? "unknown"}`);
  }
  return payload.data;
}

const bytes = await readFile(MODEL);
const form = new FormData();
form.append("file", new Blob([bytes], { type: "model/gltf-binary" }), "lyra-rig-proxy.glb");
const upload = await envelope(await fetch(`${BASE}/files`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form,
  redirect: "error",
  signal: AbortSignal.timeout(45_000)
}), "FILE_UPLOAD");
if (typeof upload.file_token !== "string" || !upload.file_token.startsWith("file_")) {
  throw new Error("TRIPO_FILE_TOKEN_INVALID");
}

const submitted = await envelope(await fetch(`${BASE}/animations/rig-check`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ input: upload.file_token }),
  redirect: "error",
  signal: AbortSignal.timeout(30_000)
}), "RIG_CHECK_SUBMIT");
if (typeof submitted.task_id !== "string" || !submitted.task_id.startsWith("task_")) {
  throw new Error("TRIPO_RIG_CHECK_TASK_ID_INVALID");
}

let result = null;
for (let attempt = 0; attempt < 60; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 2_000));
  const task = await envelope(await fetch(`${BASE}/tasks/${encodeURIComponent(submitted.task_id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "error",
    signal: AbortSignal.timeout(30_000)
  }), "RIG_CHECK_POLL");
  if (task.status === "success") { result = task; break; }
  if (["failed", "cancelled", "banned"].includes(task.status)) {
    throw new Error(`TRIPO_RIG_CHECK_${String(task.status).toUpperCase()}`);
  }
}
if (!result) throw new Error("TRIPO_RIG_CHECK_TIMEOUT");
if (result.output?.riggable !== true) throw new Error("TRIPO_LYRA_NOT_RIGGABLE");
if (result.output?.rig_type !== "biped") throw new Error(`TRIPO_LYRA_RIG_TYPE_${String(result.output?.rig_type ?? "missing")}`);
if (typeof result.credits_consumed === "number" && result.credits_consumed !== 0) {
  throw new Error(`TRIPO_RIG_CHECK_UNEXPECTED_CREDITS_${result.credits_consumed}`);
}

const receipt = {
  schema: "aurion.lyra.tripo-rig-check.v1",
  ok: true,
  input: "verified geometry proxy",
  sourceProxySha256: "86f24722ca77f1822f67187f043c11cb1245c091f826c235a4c294e9a62a687e",
  taskId: submitted.task_id,
  riggable: true,
  rigType: "biped",
  creditsConsumed: result.credits_consumed ?? null,
  fileTokenObserved: true
};
await mkdir(path.dirname(RECEIPT), { recursive: true });
await writeFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(receipt));
