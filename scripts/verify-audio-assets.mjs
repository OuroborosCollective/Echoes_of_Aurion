import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(projectRoot, "shared", "audioAssetIntegrity.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function fail(message) {
  throw new Error(`Aurion audio integrity: ${message}`);
}

function assertManifest() {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length !== 8) {
    fail("expected schemaVersion=1 with exactly eight soundtrack assets.");
  }
  if (!Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 1) fail("totalBytes is invalid.");
  const roles = new Set();
  const sources = new Set();
  const hashes = new Set();
  for (const asset of manifest.assets) {
    for (const field of ["role", "source", "target", "sha256"]) {
      if (typeof asset[field] !== "string" || asset[field].length === 0) fail(`${field} is required.`);
    }
    if (path.basename(asset.source) !== asset.source || path.basename(asset.target) !== asset.target) fail(`${asset.target}: filenames must be basenames.`);
    if (!asset.source.endsWith(".wav") || !asset.target.endsWith(".wav")) fail(`${asset.target}: canonical repository masters must remain WAV.`);
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 44) fail(`${asset.target}: byte count is invalid.`);
    if (!/^[a-f0-9]{64}$/.test(asset.sha256)) fail(`${asset.target}: SHA-256 is invalid.`);
    if (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds < 30) fail(`${asset.target}: duration is invalid.`);
    if (roles.has(asset.role) || sources.has(asset.source) || hashes.has(asset.sha256)) fail(`${asset.target}: duplicate identity in manifest.`);
    roles.add(asset.role);
    sources.add(asset.source);
    hashes.add(asset.sha256);
  }
  const total = manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0);
  if (total !== manifest.totalBytes) fail(`totalBytes mismatch; expected ${manifest.totalBytes}, calculated ${total}.`);
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function readWavHeader(filePath) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function assertPcmWav(asset, buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    fail(`${asset.target}: not a RIFF/WAVE file.`);
  }
  let offset = 12;
  let formatFound = false;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= buffer.length) {
      const audioFormat = buffer.readUInt16LE(body);
      const channels = buffer.readUInt16LE(body + 2);
      const sampleRate = buffer.readUInt32LE(body + 4);
      const bitsPerSample = buffer.readUInt16LE(body + 14);
      if (audioFormat !== 1 || channels !== manifest.format.channels || sampleRate !== manifest.format.sampleRateHz || bitsPerSample !== manifest.format.bitsPerSample) {
        fail(`${asset.target}: expected PCM S16LE ${manifest.format.sampleRateHz} Hz stereo.`);
      }
      formatFound = true;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!formatFound) fail(`${asset.target}: fmt chunk was not found in the bounded header read.`);
}

assertManifest();
let verifiedBytes = 0;
for (const asset of manifest.assets) {
  const filePath = path.join(projectRoot, "public", "audio", asset.source);
  const fileStat = await stat(filePath);
  if (fileStat.size !== asset.bytes) fail(`${asset.target}: expected ${asset.bytes} bytes, observed ${fileStat.size}.`);
  const digest = await sha256(filePath);
  if (digest !== asset.sha256) fail(`${asset.target}: expected SHA-256 ${asset.sha256}, observed ${digest}.`);
  assertPcmWav(asset, await readWavHeader(filePath));
  verifiedBytes += fileStat.size;
  console.log(`audio_asset_verified role=${asset.role} target=${asset.target} bytes=${asset.bytes} sha256=${asset.sha256}`);
}
if (verifiedBytes !== manifest.totalBytes) fail(`verified byte total mismatch: ${verifiedBytes}.`);
console.log(`Aurion soundtrack integrity verified: ${manifest.assets.length} local PCM masters, ${verifiedBytes} bytes, no external music source.`);
