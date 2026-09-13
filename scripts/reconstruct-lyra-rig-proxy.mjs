import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve("tools/game-dev/lyra-rig-proxy");
const OUTPUT = path.resolve(".game-dev/workspace/lyra-rig-proxy.glb");
const EXPECTED_XZ_SHA = "014a9140a5260153651762cee235293fb12057728f72debff0e3780b14d3eea1";
const EXPECTED_XZ_BYTES = 39016;
const EXPECTED_GLB_SHA = "86f24722ca77f1822f67187f043c11cb1245c091f826c235a4c294e9a62a687e";
const EXPECTED_GLB_BYTES = 68092;
const CHUNKS = 14;

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

const pieces = [];
for (let index = 0; index < CHUNKS; index += 1) {
  const name = `chunk-${String(index).padStart(2, "0")}.b64`;
  pieces.push((await readFile(path.join(ROOT, name), "utf8")).trim());
}
const encoded = pieces.join("");
const compressed = Buffer.from(encoded, "base64");
if (compressed.toString("base64") !== encoded) throw new Error("LYRA_RIG_PROXY_BASE64_NON_CANONICAL");
if (compressed.length !== EXPECTED_XZ_BYTES) throw new Error(`LYRA_RIG_PROXY_XZ_BYTES_${compressed.length}`);
if (sha256(compressed) !== EXPECTED_XZ_SHA) throw new Error("LYRA_RIG_PROXY_XZ_SHA_MISMATCH");

const unpacked = spawnSync("xz", ["-dc"], { input: compressed, maxBuffer: 2 * 1024 * 1024 });
if (unpacked.status !== 0 || !Buffer.isBuffer(unpacked.stdout)) {
  throw new Error(`LYRA_RIG_PROXY_XZ_DECODE_FAILED_${unpacked.status ?? "unknown"}`);
}
const glb = unpacked.stdout;
if (glb.length !== EXPECTED_GLB_BYTES) throw new Error(`LYRA_RIG_PROXY_GLB_BYTES_${glb.length}`);
if (sha256(glb) !== EXPECTED_GLB_SHA) throw new Error("LYRA_RIG_PROXY_GLB_SHA_MISMATCH");
if (glb.subarray(0, 4).toString("ascii") !== "glTF") throw new Error("LYRA_RIG_PROXY_NOT_GLB");
if (glb.readUInt32LE(4) !== 2 || glb.readUInt32LE(8) !== glb.length) throw new Error("LYRA_RIG_PROXY_HEADER_INVALID");

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, glb, { mode: 0o600 });
console.log(JSON.stringify({
  recordType: "aurion.lyra.rig-proxy-reconstruction.v1",
  ok: true,
  sha256: EXPECTED_GLB_SHA,
  bytes: glb.length,
  compressedSha256: EXPECTED_XZ_SHA,
  chunks: CHUNKS,
  output: ".game-dev/workspace/lyra-rig-proxy.glb"
}));
