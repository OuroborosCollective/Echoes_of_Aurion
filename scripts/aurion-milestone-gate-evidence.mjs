import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GATE_EVIDENCE_SCHEMA = "aurion.milestone.gate-evidence.v1";
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const scopes = new Set(["repository", "runtime", "production"]);
const secretValuePatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
];

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string" && item.trim().length > 0);
}
function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function safeRelativeFile(root, value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.split(/[\\/]+/).includes("..")) return false;
  return existsSync(path.join(root, value));
}
function scanSecrets(value, trail = "$") {
  const findings = [];
  if (typeof value === "string") {
    if (secretValuePatterns.some(pattern => pattern.test(value))) findings.push(trail);
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findings.push(...scanSecrets(entry, `${trail}[${index}]`)));
    return findings;
  }
  if (object(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (/(?:secret|password|private[_-]?key|access[_-]?token|refresh[_-]?token)$/i.test(key) && entry) findings.push(`${trail}.${key}`);
      findings.push(...scanSecrets(entry, `${trail}.${key}`));
    }
  }
  return findings;
}

export function evaluateGateEvidence(record, options = {}) {
  const root = options.root ?? process.cwd();
  const errors = [];
  if (!object(record)) return { status: "FAIL", errors: ["record:not_object"] };
  if (record.schemaVersion !== GATE_EVIDENCE_SCHEMA) errors.push("schemaVersion");
  if (typeof record.gateId !== "string" || !/^AURION-M21-B[0-9]+-[A-Z0-9-]+$/.test(record.gateId)) errors.push("gateId");
  if (!scopes.has(record.scope)) errors.push("scope");
  if (!nonEmptyStrings(record.passCriteria)) errors.push("passCriteria");
  if (!nonEmptyStrings(record.failCriteria)) errors.push("failCriteria");
  if (!SHA40.test(record.sourceRevision ?? "")) errors.push("sourceRevision");
  if (typeof record.workflow !== "string" || !record.workflow.trim()) errors.push("workflow");
  if (typeof record.command !== "string" || !record.command.trim()) errors.push("command");
  if (!nonEmptyStrings(record.testSources) || !record.testSources.every(source => safeRelativeFile(root, source))) errors.push("testSources");
  if (!object(record.expected)) errors.push("expected");
  if (!object(record.observed)) errors.push("observed");
  if (typeof record.externalId !== "string" || !record.externalId.trim()) errors.push("externalId");
  if (record.reproducible !== true) errors.push("reproducible");

  if (!Array.isArray(record.checks) || record.checks.length < 1) {
    errors.push("checks");
  } else {
    for (const [index, check] of record.checks.entries()) {
      if (!object(check) || typeof check.name !== "string" || !check.name.trim() || typeof check.pass !== "boolean" || !("expected" in check) || !("observed" in check)) {
        errors.push(`checks[${index}]`);
      }
    }
  }

  if (!object(record.releaseIdentity) || record.releaseIdentity.sourceRevision !== record.sourceRevision) {
    errors.push("releaseIdentity.sourceRevision");
  }
  if (record.scope === "runtime" || record.scope === "production") {
    for (const key of ["buildInputDigest", "artifactDigest", "runtimeImageDigest"]) {
      if (!SHA256.test(record.releaseIdentity?.[key] ?? "")) errors.push(`releaseIdentity.${key}`);
    }
  }
  if (record.scope === "production") {
    if (record.authenticatedReadback !== true) errors.push("authenticatedReadback");
    if (!SHA40.test(record.mergeSha ?? "") || record.mergeSha !== record.sourceRevision) errors.push("mergeSha");
  }

  const secretFindings = scanSecrets(record);
  if (secretFindings.length) errors.push(...secretFindings.map(item => `secret:${item}`));

  const checksPass = Array.isArray(record.checks) && record.checks.length > 0 && record.checks.every(check => check?.pass === true);
  const computedStatus = errors.length === 0 && checksPass ? "PASS" : "FAIL";
  if (record.status !== computedStatus) errors.push(`status:${record.status ?? "missing"}!=${computedStatus}`);
  return { status: errors.length === 0 && record.status === "PASS" ? "PASS" : "FAIL", errors };
}

export function assertGateEvidence(record, options = {}) {
  const result = evaluateGateEvidence(record, options);
  if (result.status !== "PASS") throw new Error(`AURION_GATE_EVIDENCE_INVALID:${result.errors.join(",")}`);
  return record;
}

function main() {
  const [, , command, file, flag] = process.argv;
  if (command !== "verify" || !file) {
    console.error("usage: node scripts/aurion-milestone-gate-evidence.mjs verify <receipt.json> [--require-pass]");
    process.exit(64);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(String(error));
    process.exit(65);
  }
  const result = evaluateGateEvidence(parsed);
  process.stdout.write(`${JSON.stringify({ file, ...result })}\n`);
  if (flag === "--require-pass" && result.status !== "PASS") process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
