import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [mode, evidenceDir, revision, statusArg] = process.argv.slice(2);
if (!["seal","verify"].includes(mode) || !evidenceDir || !/^[a-f0-9]{40}$/.test(revision ?? "")) {
  throw new Error("USAGE: verify-starter-village-evidence.mjs <seal|verify> <dir> <40-char-revision> [PASS|PARTIAL]");
}

const requiredSchemas = new Map([
  [`journey-${revision}.json`, "aurion.starter-village-pilot.journey.v2"],
  [`restart-readback-${revision}.json`, "aurion.starter-village-pilot.restart-readback.v2"],
  ["public-character-seed.json", "aurion.starter-village-public-character-seed.v1"],
  ["fountain-seed.json", "aurion.starter-village-fountain-seed.v1"],
  ["browser-trace-phone.json", "aurion.starter-village-browser-trace.v1"],
  ["browser-trace-tablet.json", "aurion.starter-village-browser-trace.v1"],
  ["browser-trace-desktop.json", "aurion.starter-village-browser-trace.v1"],
  ["browser-trace-landscape.json", "aurion.starter-village-browser-trace.v1"],
]);
const requiredFiles = [
  "network-isolation.json",
  "runtime-entry-before.json",
  ...requiredSchemas.keys(),
  "phone-starter-pilot.png",
  "tablet-starter-pilot.png",
  "desktop-starter-pilot.png",
  "landscape-starter-pilot.png",
];
const forbiddenName = /session|cookie|token|secret|credential|authorization/i;
const forbiddenContent = /(authorization\s*[:=]|bearer\s+[A-Za-z0-9._~+\/-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|set-cookie\s*:|jwt_secret)/i;

const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const relFiles = () => fs.existsSync(evidenceDir)
  ? fs.readdirSync(evidenceDir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => path.relative(evidenceDir, path.join(entry.parentPath ?? entry.path, entry.name)).replaceAll("\\","/"))
      .sort()
  : [];

function parseJson(relative) {
  const file = path.join(evidenceDir, relative);
  const raw = fs.readFileSync(file, "utf8");
  if (!raw.trim()) throw new Error(`EMPTY_JSON:${relative}`);
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`INVALID_JSON_OBJECT:${relative}`);
  return { raw, parsed };
}

function assertNoSecrets(files) {
  for (const relative of files) {
    if (forbiddenName.test(relative)) throw new Error(`FORBIDDEN_EVIDENCE_FILENAME:${relative}`);
    const file = path.join(evidenceDir, relative);
    const st = fs.statSync(file);
    if (st.size === 0) throw new Error(`EMPTY_EVIDENCE_FILE:${relative}`);
    if (/\.(json|txt|log|md)$/i.test(relative)) {
      const raw = fs.readFileSync(file, "utf8");
      if (forbiddenContent.test(raw)) throw new Error(`SENSITIVE_EVIDENCE_CONTENT:${relative}`);
    }
  }
}

function validateContent({ requireComplete }) {
  const files = relFiles().filter(x => !["SHA256SUMS","EVIDENCE_MANIFEST.json","REVISION"].includes(x));
  assertNoSecrets(files);
  const missing = requiredFiles.filter(relative => !files.includes(relative));
  if (requireComplete && missing.length) throw new Error(`MISSING_REQUIRED_EVIDENCE:${missing.join(",")}`);

  for (const [relative, schema] of requiredSchemas) {
    if (!files.includes(relative)) continue;
    const { parsed } = parseJson(relative);
    if (parsed.schema !== schema) throw new Error(`SCHEMA_MISMATCH:${relative}`);
    const sourceRevision = parsed.sourceRevision ?? parsed.revision;
    if (sourceRevision !== revision) throw new Error(`REVISION_MISMATCH:${relative}`);
    if (parsed.rawSessionMaterialIncluded === true) throw new Error(`RAW_SESSION_MATERIAL_FORBIDDEN:${relative}`);
  }
  if (files.includes("network-isolation.json")) {
    const { parsed } = parseJson("network-isolation.json");
    if (parsed.externalEgressAllowed !== false || parsed.loopbackAllowed !== true) throw new Error("NETWORK_EVIDENCE_INVALID");
  }
  return { files, missing };
}

if (mode === "seal") {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const status = statusArg === "PASS" ? "PASS" : "PARTIAL";
  const { files, missing } = validateContent({ requireComplete: status === "PASS" });
  fs.writeFileSync(path.join(evidenceDir, "REVISION"), `${revision}  revision\n`);
  const manifest = {
    schema: "aurion.starter-village-evidence-manifest.v1",
    revision,
    status,
    missingRequired: missing,
    files: Object.fromEntries(files.map(relative => [relative, sha256(path.join(evidenceDir, relative))])),
  };
  fs.writeFileSync(path.join(evidenceDir, "EVIDENCE_MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  const hashTargets = [...files, "EVIDENCE_MANIFEST.json", "REVISION"].sort();
  fs.writeFileSync(path.join(evidenceDir, "SHA256SUMS"), hashTargets.map(relative => `${sha256(path.join(evidenceDir, relative))}  ${relative}`).join("\n") + "\n");
}

const requireComplete = mode === "verify";
const { missing } = validateContent({ requireComplete });
const revisionText = fs.readFileSync(path.join(evidenceDir, "REVISION"), "utf8").trim();
if (revisionText !== `${revision}  revision`) throw new Error("REVISION_FILE_MISMATCH");
const manifest = parseJson("EVIDENCE_MANIFEST.json").parsed;
if (manifest.schema !== "aurion.starter-village-evidence-manifest.v1" || manifest.revision !== revision) throw new Error("MANIFEST_CONTRACT_MISMATCH");
if (requireComplete && manifest.status !== "PASS") throw new Error("EVIDENCE_STATUS_NOT_PASS");
if (requireComplete && missing.length) throw new Error("EVIDENCE_INCOMPLETE");
const checksumLines = fs.readFileSync(path.join(evidenceDir, "SHA256SUMS"), "utf8").trim().split("\n").filter(Boolean);
for (const line of checksumLines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match) throw new Error("CHECKSUM_LINE_INVALID");
  const [, expected, relative] = match;
  const file = path.join(evidenceDir, relative);
  if (!fs.existsSync(file) || sha256(file) !== expected) throw new Error(`CHECKSUM_MISMATCH:${relative}`);
}
console.log(JSON.stringify({ schema: "aurion.starter-village-evidence-verdict.v1", revision, status: manifest.status, required: requiredFiles.length, missing: manifest.missingRequired ?? [] }));
