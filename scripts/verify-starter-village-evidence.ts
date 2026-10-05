import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type Outcome = "success" | "failure" | "cancelled" | "skipped";
type Manifest = {
  schema: "aurion.starter-village-evidence-manifest.v1";
  revision: string;
  status: "PASS" | "PARTIAL" | "FAIL";
  phases: {
    journey: Outcome;
    restart: Outcome;
    diagnostic: Outcome;
    publicCharacter: Outcome;
    fountain: Outcome;
    browser: Outcome;
  };
  failureArtifacts: string[];
};

const PHASE_FILES: Record<keyof Manifest["phases"], (revision: string) => string[]> = {
  journey: revision => [
    `journey-${revision}.json`,
    "network-isolation.json",
    "runtime-entry-before.json",
    "server-before.log",
    "health-before.json",
  ],
  restart: revision => [`restart-readback-${revision}.json`, "server-after.log"],
  diagnostic: () => ["empty-catalog-diagnostic.json", "empty-catalog-diagnostic.png"],
  publicCharacter: () => ["public-character-seed.json"],
  fountain: () => ["fountain-seed.json"],
  browser: () => [
    "browser-trace-phone.json", "phone-starter-pilot.png",
    "browser-trace-tablet.json", "tablet-starter-pilot.png",
    "browser-trace-desktop.json", "desktop-starter-pilot.png",
    "browser-trace-landscape.json", "landscape-starter-pilot.png",
  ],
};

const ALWAYS_FILES = ["REVISION", "manifest.json"] as const;

function digest(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function listFiles(root: string) {
  const files: string[] = [];
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  await walk(root);
  return files.sort();
}

function requireRevision(value: unknown, revision: string, file: string) {
  if (!value || typeof value !== "object") throw new Error(`EVIDENCE_JSON_OBJECT_REQUIRED:${file}`);
  const object = value as Record<string, unknown>;
  const observed = object.sourceRevision ?? object.revision;
  if (observed !== revision) throw new Error(`EVIDENCE_REVISION_MISMATCH:${file}`);
  if (typeof object.schema !== "string" || object.schema.length < 8) throw new Error(`EVIDENCE_SCHEMA_REQUIRED:${file}`);
}

function containsSensitiveKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    if (["cookie", "authorization", "jwt", "password", "apikey", "secret"].some(part => normalized.includes(part))) return true;
    if (containsSensitiveKey(child)) return true;
  }
  return false;
}

function containsSensitiveText(text: string) {
  const lower = text.toLowerCase();
  const markers = [
    "authorization" + ":",
    "cookie" + ":",
    "set-" + "cookie" + ":",
    "jwt_" + "secret",
    "api_" + "key",
    "database_" + "url=",
  ];
  return markers.some(marker => {
    let offset = lower.indexOf(marker);
    while (offset >= 0) {
      const tail = lower.slice(offset + marker.length, offset + marker.length + 96);
      if (!tail.includes("[redacted]")) return true;
      offset = lower.indexOf(marker, offset + marker.length);
    }
    return false;
  });
}

export async function verifyStarterVillageEvidence(root: string, revision: string, requireHashes = true) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("EVIDENCE_EXPECTED_REVISION_INVALID");

  const files = await listFiles(root);
  if (files.includes("session.json")) throw new Error("EVIDENCE_EPHEMERAL_SESSION_FORBIDDEN");

  const revisionText = (await readFile(path.join(root, "REVISION"), "utf8")).trim();
  if (revisionText !== `${revision}  revision`) throw new Error("EVIDENCE_REVISION_FILE_MISMATCH");

  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as Manifest;
  if (manifest.schema !== "aurion.starter-village-evidence-manifest.v1") throw new Error("EVIDENCE_MANIFEST_SCHEMA_INVALID");
  if (manifest.revision !== revision) throw new Error("EVIDENCE_MANIFEST_REVISION_MISMATCH");

  const outcomes = Object.values(manifest.phases);
  const allSuccess = outcomes.every(outcome => outcome === "success");
  if (manifest.status === "PASS" && !allSuccess) throw new Error("EVIDENCE_PASS_REQUIRES_ALL_PHASES_SUCCESS");
  if (allSuccess && manifest.status !== "PASS") throw new Error("EVIDENCE_ALL_SUCCESS_REQUIRES_PASS");

  const required = new Set<string>(ALWAYS_FILES);
  for (const [phase, outcome] of Object.entries(manifest.phases) as Array<[keyof Manifest["phases"], Outcome]>) {
    if (outcome === "success") for (const file of PHASE_FILES[phase](revision)) required.add(file);
  }
  if (manifest.phases.browser === "failure" && manifest.failureArtifacts.length === 0)
    throw new Error("EVIDENCE_BROWSER_FAILURE_ARTIFACT_REQUIRED");
  for (const file of manifest.failureArtifacts) {
    if (!files.includes(file)) throw new Error(`EVIDENCE_FAILURE_ARTIFACT_MISSING:${file}`);
    if ((await stat(path.join(root, file))).size === 0) throw new Error(`EVIDENCE_FAILURE_ARTIFACT_EMPTY:${file}`);
  }

  for (const file of required) {
    if (!files.includes(file)) throw new Error(`EVIDENCE_REQUIRED_FILE_MISSING:${file}`);
    if ((await stat(path.join(root, file))).size === 0) throw new Error(`EVIDENCE_REQUIRED_FILE_EMPTY:${file}`);
  }

  for (const file of files) {
    if (file === "SHA256SUMS" || file === "REVISION" || file.endsWith(".png") || file.endsWith(".zip")) continue;
    const text = await readFile(path.join(root, file), "utf8");
    if (file.endsWith(".json")) {
      const parsed = JSON.parse(text);
      if (containsSensitiveKey(parsed)) throw new Error(`EVIDENCE_SENSITIVE_KEY:${file}`);
      if (!["manifest.json", "network-isolation.json", "runtime-entry-before.json"].includes(file))
        requireRevision(parsed, revision, file);
    } else if (containsSensitiveText(text)) {
      throw new Error(`EVIDENCE_SENSITIVE_TEXT:${file}`);
    }
  }

  if (requireHashes) {
    const sums = (await readFile(path.join(root, "SHA256SUMS"), "utf8")).trim().split("\n").filter(Boolean);
    const hashes = new Map<string, string>();
    for (const line of sums) {
      const match = line.match(/^([a-f0-9]{64})  (.+)$/);
      if (!match) throw new Error("EVIDENCE_HASH_MANIFEST_INVALID");
      hashes.set(match[2], match[1]);
    }
    const hashFiles = files.filter(file => file !== "SHA256SUMS");
    if (hashes.size !== hashFiles.length) throw new Error("EVIDENCE_HASH_MANIFEST_INCOMPLETE");
    for (const file of hashFiles) {
      const actual = digest(await readFile(path.join(root, file)));
      if (hashes.get(file) !== actual) throw new Error(`EVIDENCE_HASH_MISMATCH:${file}`);
    }
  }

  return { manifest, files, required: [...required].sort() };
}

if (process.argv[1]?.endsWith("verify-starter-village-evidence.ts")) {
  const root = process.argv[2];
  const revision = process.argv[3];
  if (!root || !revision) throw new Error("EVIDENCE_VERIFY_ARGS_REQUIRED");
  const result = await verifyStarterVillageEvidence(root, revision);
  console.log(JSON.stringify({
    schema: "aurion.starter-village-evidence-verification.v1",
    revision,
    status: result.manifest.status,
    fileCount: result.files.length,
  }));
}
