import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const NERVA_VERSION = "v1.75.1";
export const NERVA_LINUX_AMD64_SHA256 = "812b0ec0ec824ed97a09a2e670a53a2cc10d446da09788550f93a560db871ccd";
const profiles = Object.freeze({
  "public-web": Object.freeze([
    { id: "aurion_https", address: "arelogic.space:443", port: 443 },
    { id: "aurion_http", address: "arelogic.space:80", port: 80 },
  ]),
});
export function selectTargets(profile) {
  if (!Object.hasOwn(profiles, profile)) throw new Error("NERVA_PROFILE_NOT_ALLOWED");
  return profiles[profile].map(item => ({ ...item }));
}
export function parseNervaResponse(raw, expectedPort) {
  if (!raw.trim()) return { state: "unverified", protocol: null, findings: [] };
  let records;
  try {
    const parsed = JSON.parse(raw);
    records = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    try { records = raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
    catch { throw new Error("NERVA_JSON_INVALID"); }
  }
  const record = records.find(item => item && item.port === expectedPort);
  if (!record) throw new Error("NERVA_PORT_MISMATCH");
  if (record.security_findings != null && !Array.isArray(record.security_findings)) throw new Error("NERVA_FINDINGS_INVALID");
  const findings = (record.security_findings ?? []).map(finding => ({
    id: String(finding.id ?? "unknown").slice(0, 96).replace(/[^a-zA-Z0-9_-]/g, "_"),
    severity: ["critical", "high", "medium", "low", "info"].includes(String(finding.severity).toLowerCase()) ? String(finding.severity).toLowerCase() : "unknown",
  }));
  return { state: "observed", protocol: String(record.protocol ?? "unknown").slice(0, 64).replace(/[^a-zA-Z0-9_+.-]/g, "_"), findings };
}
export function buildReceipt({ revision, profile, results }) {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("NERVA_REVISION_INVALID");
  if (!Array.isArray(results) || results.length !== selectTargets(profile).length) throw new Error("NERVA_RESULTS_INVALID");
  const entries = results.map(result => ({
    targetId: result.id, port: result.port, state: result.state, protocol: result.protocol,
    findings: result.findings.map(f => ({ id: f.id, severity: f.severity })),
  }));
  const status = entries.some(x => x.state === "error") ? "ERROR" :
    entries.some(x => x.state !== "observed") ? "INCOMPLETE" :
    entries.some(x => x.findings.length) ? "FINDINGS" : "PASS";
  return {
    schemaVersion: "aurion.nerva.network-security.v1",
    sourceRevision: revision,
    profile,
    nerva: { version: NERVA_VERSION, linuxAmd64Sha256: NERVA_LINUX_AMD64_SHA256 },
    privacy: { rawOutputStored: false, sourceHostnamesStored: false, rawMetadataStored: false },
    results: entries, status,
    releaseBlocking: false,
    authority: "advisory infrastructure observation only",
  };
}
async function main() {
  const profile = process.env.NERVA_PROFILE ?? "";
  const revision = process.env.GITHUB_SHA ?? "";
  const targets = selectTargets(profile);
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("NERVA_REVISION_INVALID");
  const output = process.env.NERVA_RECEIPT_PATH ?? "nerva-evidence/receipt.json";
  const results = targets.map(target => {
    const run = spawnSync(process.env.NERVA_BINARY ?? "nerva", [
      "-t", target.address, "--json", "--misconfigs", "--scan-depth", "fast",
      "--workers", "1", "--max-host-conn", "1", "--rate-limit", "1", "--timeout", "2000",
    ], { encoding: "utf8", timeout: 25000, maxBuffer: 1048576 });
    if (run.error || run.status !== 0) return { id: target.id, port: target.port, state: "error", protocol: null, findings: [] };
    try { return { id: target.id, port: target.port, ...parseNervaResponse(run.stdout, target.port) }; }
    catch { return { id: target.id, port: target.port, state: "error", protocol: null, findings: [] }; }
  });
  const receipt = buildReceipt({ revision, profile, results });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ status: receipt.status, profile: receipt.profile, targetCount: receipt.results.length }));
  if (receipt.status === "ERROR") process.exitCode = 2;
}
if (import.meta.url === `file://${process.argv[1]}`) await main().catch(error => {
  console.error(error.message); process.exitCode = 2;
});
