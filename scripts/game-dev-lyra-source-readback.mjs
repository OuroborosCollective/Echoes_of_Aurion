import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TASK_ID = "60ce5ff4-ab86-440d-8fc7-dc25b7da6b25";
const EXPECTED_SHA256 = "54b163ba60f74f1fb2355bceb537626076db6918cf699e5a21ae1bf37b148b24";
const EXPECTED_BYTES = 1691648;
const OUTPUT = path.resolve(".game-dev/workspace/lyra-source.glb");
const apiKey = process.env.TRIPO_API_KEY?.trim();
const TRIPO_V3_BASE_URL = "https://openapi.tripo3d.ai/v3";

if (!apiKey) throw new Error("TRIPO_API_KEY_MISSING");
if (/^Bearer\s+/i.test(apiKey)) throw new Error("TRIPO_SECRET_MUST_BE_RAW_API_KEY_WITHOUT_BEARER_PREFIX");
if (apiKey.startsWith("tcli_")) throw new Error("TRIPO_CLIENT_ID_IS_NOT_API_KEY");
if (!apiKey.startsWith("tsk_")) throw new Error("TRIPO_API_KEY_PREFIX_INVALID_EXPECTED_TSK");

async function jsonResponse(url, context) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "error",
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error(`TRIPO_${context}_NON_JSON_${response.status}`); }
  if (!response.ok || payload?.code !== 0 || !payload?.data) {
    throw new Error(`TRIPO_${context}_FAILED_${response.status}_${payload?.code ?? "unknown"}`);
  }
  return payload.data;
}

await jsonResponse(`${TRIPO_V3_BASE_URL}/account/balance`, "AUTH_READBACK");
const task = await jsonResponse(`${TRIPO_V3_BASE_URL}/tasks/${encodeURIComponent(TASK_ID)}`, "TASK_READBACK");
if (task.task_id !== TASK_ID) throw new Error("TRIPO_TASK_ID_MISMATCH");
if (task.status !== "success") throw new Error(`TRIPO_SOURCE_NOT_SUCCESS_${String(task.status).toUpperCase()}`);

const candidate = task.output?.pbr_model ?? task.output?.model ?? task.output?.base_model;
if (typeof candidate !== "string") throw new Error("TRIPO_SOURCE_MODEL_URL_MISSING");
const sourceUrl = new URL(candidate);
if (sourceUrl.protocol !== "https:") throw new Error("TRIPO_SOURCE_MODEL_URL_NOT_HTTPS");

const modelResponse = await fetch(sourceUrl, { redirect: "error" });
if (!modelResponse.ok) throw new Error(`TRIPO_SOURCE_DOWNLOAD_FAILED_${modelResponse.status}`);
const bytes = Buffer.from(await modelResponse.arrayBuffer());
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (bytes.length !== EXPECTED_BYTES) throw new Error(`LYRA_SOURCE_BYTES_MISMATCH_${bytes.length}`);
if (sha256 !== EXPECTED_SHA256) throw new Error(`LYRA_SOURCE_SHA_MISMATCH_${sha256}`);
if (bytes.subarray(0, 4).toString("ascii") !== "glTF") throw new Error("LYRA_SOURCE_NOT_GLB");

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, bytes, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({
  recordType: "aurion.lyra.tripo-source-readback.v2",
  ok: true,
  authentication: "verified",
  taskId: TASK_ID,
  providerStatus: task.status,
  providerApi: "tripo-v3",
  sha256,
  bytes: bytes.length,
  output: ".game-dev/workspace/lyra-source.glb",
  providerCallsCharged: false,
}));
