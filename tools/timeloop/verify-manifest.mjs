import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { normalizeTimeloopManifest } from "./timeloopManifest.mjs";

const fixturePath = new URL("./fixtures/render-ecs-distance-proxy.v1.json", import.meta.url);
const input = JSON.parse(await readFile(fixturePath, "utf8"));
const manifest = normalizeTimeloopManifest(input);

function git(args, options = {}) { return execFileSync("git", args, { encoding: "utf8", ...options }).trim(); }

git(["cat-file", "-e", manifest.sourceRevision + "^{commit}"]);
const sourceBytes = execFileSync("git", ["show", manifest.sourceRevision + ":" + manifest.sourceEvidence.path]);
const actualBlobSha = git(["hash-object", "--stdin"], { input: sourceBytes });

if (actualBlobSha !== manifest.sourceEvidence.blobSha) throw new Error("TIMELOOP_SOURCE_BLOB_READBACK_MISMATCH");
if (!/^sha256:[a-f0-9]{64}$/.test(manifest.manifestHash)) throw new Error("TIMELOOP_MANIFEST_HASH_INVALID");

const negativeRandom = { ...input, runtime: { randomSeed: 7 } };
let negativeRejected = false;
try { normalizeTimeloopManifest(negativeRandom); } catch (error) {
  negativeRejected = String(error.message).includes("TIMELOOP_MANIFEST_NON_DETERMINISTIC_FIELD");
}
if (!negativeRejected) throw new Error("TIMELOOP_NON_DETERMINISM_REGRESSION");

const negativePin = { ...input, timeloop: { ...input.timeloop, commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } };
let pinRejected = false;
try { normalizeTimeloopManifest(negativePin); } catch (error) {
  pinRejected = String(error.message).includes("TIMELOOP_MANIFEST_UPSTREAM_COMMIT_NOT_PINNED");
}
if (!pinRejected) throw new Error("TIMELOOP_PIN_REGRESSION");

console.log(JSON.stringify({
  status: "PASS",
  manifestHash: manifest.manifestHash,
  sourceRevision: manifest.sourceRevision,
  sourceEvidence: manifest.sourceEvidence,
  sourceBlobReadback: actualBlobSha,
  upstreamTimeloopCommit: manifest.timeloop.commit,
  authority: manifest.authority,
  analysisStatus: manifest.analysisStatus,
}, null, 2));
