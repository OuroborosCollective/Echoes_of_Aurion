#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DONOR_LEDGER_STATUSES = Object.freeze([
  "DONOR_ONLY",
  "PORTED",
  "PARITY_VERIFIED",
  "RUNTIME_VERIFIED",
  "AURION_OWNED",
  "DONOR_RETIRED",
]);

const PRODUCTIVE = new Set(["AURION_OWNED", "DONOR_RETIRED"]);
const SHA40 = /^[0-9a-f]{40}$/;
const CAPABILITY_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function relativeFiles(root, relativeRoot) {
  const absolute = path.join(root, relativeRoot);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [relativeRoot.replaceAll("\\", "/")];
  const out = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "build") continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).replaceAll("\\", "/"));
    }
  };
  walk(absolute);
  return out;
}

function runtimeScanFiles(root) {
  const explicit = ["package.json", "Dockerfile", "docker-compose.yml", "docker-compose.yaml"];
  const roots = ["server", "shared", "client/src", "drizzle", "config", "vendor", "scripts", "deploy", ".github/workflows"];
  const set = new Set(explicit.filter(file => fs.existsSync(path.join(root, file))));
  for (const relativeRoot of roots) {
    for (const file of relativeFiles(root, relativeRoot)) {
      if (/\.(?:test|spec)\.[^.]+$/.test(file)) continue;
      if (/\.(?:ts|tsx|js|mjs|cjs|json|ya?ml|sh)$/.test(file)) set.add(file);
    }
  }
  return [...set].sort();
}

export function donorDerivedSurfaceFiles(root = process.cwd()) {
  const roots = ["server", "shared", "client/src", "drizzle", "config", "vendor", "scripts", "deploy", ".github/workflows"];
  const files = new Set();
  for (const relativeRoot of roots) {
    for (const file of relativeFiles(root, relativeRoot)) {
      if (/\.(?:test|spec)\.[^.]+$/.test(file)) continue;
      if (!/\.(?:ts|tsx|js|mjs|cjs|json|ya?ml|sh)$/.test(file)) continue;
      const donorNamed = /(?:^|\/)[^/]*(?:wasd|ax1)[^/]*$/i.test(file);
      if (
        file.startsWith("server/wasd") ||
        file.startsWith("server/ax1") ||
        file.startsWith("shared/ax1") ||
        file.startsWith("client/src/xaurion/") ||
        donorNamed ||
        file === "client/src/game/glbUsagePlan.ts"
      ) files.add(file);
    }
  }
  return [...files].sort();
}

export function externalRuntimeDependencyFindings(records) {
  const patterns = [
    ["legacy-wasd-runtime-name", /wasd-runtime-legacy/i],
    ["legacy-ax1-runtime-name", /ax1-projection-legacy/i],
    ["external-wasd-package", /(?:from\s+["']|require\(["'])@wasd\//i],
    ["external-ax1-package", /(?:from\s+["']|require\(["'])@ax1\//i],
    ["wasd-runtime-url", /https?:\/\/(?:[^/"'\s]*\.)?wasd(?:[.:"'/]|$)/i],
    ["ax1-runtime-url", /https?:\/\/(?:[^/"'\s]*\.)?ax1(?:[.:"'/]|$)/i],
    ["donor-github-source-url", /https:\/\/(?:raw\.)?githubusercontent\.com\/OuroborosCollective\/(?:Wasd|-ax1)\//i],
    ["donor-github-repository-url", /https:\/\/github\.com\/OuroborosCollective\/(?:Wasd|-ax1)\/(?:raw|blob)\//i],
    ["wasd-service-env", /\bWASD_(?:SERVICE|RUNTIME|API)_URL\b/],
    ["ax1-service-env", /\bAX1_(?:SERVICE|RUNTIME|API)_URL\b/],
  ];
  const findings = [];
  for (const record of records) {
    for (const [kind, pattern] of patterns) {
      if (pattern.test(record.content)) findings.push({ kind, path: record.path });
    }
  }
  return findings;
}

export function scanExternalRuntimeDependencies(root = process.cwd()) {
  const records = runtimeScanFiles(root).map(file => ({
    path: file,
    content: fs.readFileSync(path.join(root, file), "utf8"),
  }));
  return externalRuntimeDependencyFindings(records);
}

export function provenanceModuleReferenceFindings(records, provenancePaths) {
  const allowed = new Set(provenancePaths);
  const markers = [...allowed].map(value => path.basename(value).replace(/\.[^.]+$/, "")).filter(Boolean);
  const findings = [];
  for (const record of records) {
    if (allowed.has(record.path)) continue;
    for (const marker of markers) {
      if (record.content.includes(marker)) findings.push({ marker, path: record.path });
    }
  }
  return findings;
}

export function scanProvenanceModuleReachability(root, provenancePaths) {
  const records = runtimeScanFiles(root).map(file => ({
    path: file,
    content: fs.readFileSync(path.join(root, file), "utf8"),
  }));
  return provenanceModuleReferenceFindings(records, provenancePaths);
}

function pathExists(root, value) {
  return typeof value === "string" && value.length > 0 && fs.existsSync(path.join(root, value));
}

function hasIntegratedRoot(root, value) {
  if (typeof value !== "string" || !value) return false;
  if (pathExists(root, value)) return true;
  const normalized = value.replaceAll("\\", "/");
  const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : ".";
  return relativeFiles(root, parent).some(file => file.startsWith(normalized));
}

export function validateDonorLedgerObject(ledger, options = {}) {
  const root = options.root ?? process.cwd();
  const includeRuntimeScan = options.includeRuntimeScan ?? true;
  const findings = [];
  const fail = (code, detail) => findings.push({ code, detail });

  if (!ledger || typeof ledger !== "object") return [{ code: "LEDGER_NOT_OBJECT", detail: "root" }];
  if (ledger.schema !== "aurion.donor.ledger.v2") fail("LEDGER_SCHEMA_INVALID", String(ledger.schema));
  if (!SHA40.test(ledger.verifiedAgainstRevision ?? "")) fail("LEDGER_REVISION_INVALID", String(ledger.verifiedAgainstRevision));

  const donors = ledger.donors && typeof ledger.donors === "object" ? ledger.donors : {};
  for (const requiredDonor of ["WASD", "AX1"]) if (!donors[requiredDonor]) fail("DONOR_MISSING", requiredDonor);

  for (const [donorName, donor] of Object.entries(donors)) {
    if (!donor || typeof donor !== "object") {
      fail("DONOR_INVALID", donorName);
      continue;
    }
    if (typeof donor.repository !== "string" || !donor.repository.includes("/")) fail("DONOR_REPOSITORY_INVALID", donorName);
    if (!Array.isArray(donor.sourceInventories) || donor.sourceInventories.length === 0) fail("DONOR_SOURCE_INVENTORY_MISSING", donorName);
    else for (const inventory of donor.sourceInventories) {
      if (!SHA40.test(inventory?.revision ?? "")) fail("DONOR_SOURCE_REVISION_INVALID", `${donorName}:${inventory?.revision}`);
      if (!pathExists(root, inventory?.inventoryPath)) fail("DONOR_SOURCE_INVENTORY_PATH_MISSING", `${donorName}:${inventory?.inventoryPath}`);
    }
    if (!Array.isArray(donor.integratedRoots) || donor.integratedRoots.length === 0) fail("DONOR_INTEGRATED_ROOTS_MISSING", donorName);
    else for (const integratedRoot of donor.integratedRoots) {
      if (!hasIntegratedRoot(root, integratedRoot)) fail("DONOR_INTEGRATED_ROOT_EMPTY", `${donorName}:${integratedRoot}`);
    }
  }

  const capabilities = Array.isArray(ledger.capabilities) ? ledger.capabilities : [];
  if (capabilities.length === 0) fail("CAPABILITY_LIST_EMPTY", "capabilities");
  const ids = new Set();
  const computed = Object.fromEntries(Object.keys(donors).map(name => [name, Object.fromEntries(DONOR_LEDGER_STATUSES.map(status => [status, 0]))]));

  for (const capability of capabilities) {
    const id = capability?.capabilityId;
    if (typeof id !== "string" || !CAPABILITY_ID.test(id)) fail("CAPABILITY_ID_INVALID", String(id));
    else if (ids.has(id)) fail("CAPABILITY_ID_DUPLICATE", id);
    else ids.add(id);
    if ("id" in (capability ?? {})) fail("LEGACY_CAPABILITY_ID_FIELD_FORBIDDEN", String(id));

    const donorName = capability?.donor;
    const donor = donors[donorName];
    if (!donor) fail("CAPABILITY_DONOR_UNKNOWN", `${id}:${donorName}`);

    const status = capability?.status;
    if (!DONOR_LEDGER_STATUSES.includes(status)) fail("CAPABILITY_STATUS_INVALID", `${id}:${status}`);
    else if (computed[donorName]) computed[donorName][status] += 1;

    const source = capability?.sourceIdentity;
    if (!source || typeof source !== "object") fail("CAPABILITY_SOURCE_IDENTITY_MISSING", id);
    else {
      if (donor && source.repository !== donor.repository) fail("CAPABILITY_SOURCE_REPOSITORY_MISMATCH", id);
      if (!SHA40.test(source.revision ?? "")) fail("CAPABILITY_SOURCE_REVISION_INVALID", id);
      const sourcePaths = Array.isArray(source.sourcePaths) ? source.sourcePaths.filter(Boolean) : [];
      if (!sourcePaths.length && !source.catalogPath) fail("CAPABILITY_SOURCE_LOCATION_MISSING", id);
      if (source.catalogPath && !pathExists(root, source.catalogPath)) fail("CAPABILITY_SOURCE_CATALOG_MISSING", `${id}:${source.catalogPath}`);
    }

    for (const field of ["aurionPaths", "parityEvidence", "runtimeEvidence"]) {
      const values = capability?.[field];
      if (!Array.isArray(values) || values.length === 0) fail("CAPABILITY_PATH_SET_EMPTY", `${id}:${field}`);
      else for (const value of values) if (!pathExists(root, value)) fail("CAPABILITY_PATH_MISSING", `${id}:${field}:${value}`);
    }

    if (PRODUCTIVE.has(status)) {
      if (capability.donorRuntimeRequired !== false) fail("PRODUCTIVE_CAPABILITY_REQUIRES_DONOR_RUNTIME", id);
      if (!SHA40.test(capability.ownershipRevision ?? "")) fail("CAPABILITY_OWNERSHIP_REVISION_INVALID", id);
    }
  }

  const capabilityById = new Map(capabilities.map(capability => [capability?.capabilityId, capability]));
  const surfaces = Array.isArray(ledger.surfaceInventory) ? ledger.surfaceInventory : [];
  if (surfaces.length === 0) fail("DONOR_SURFACE_INVENTORY_EMPTY", "surfaceInventory");
  const surfacePaths = new Set();
  for (const surface of surfaces) {
    const surfacePath = surface?.path;
    if (typeof surfacePath !== "string" || !surfacePath) {
      fail("DONOR_SURFACE_PATH_INVALID", String(surfacePath));
      continue;
    }
    if (surfacePaths.has(surfacePath)) fail("DONOR_SURFACE_DUPLICATE", surfacePath);
    else surfacePaths.add(surfacePath);
    if (!pathExists(root, surfacePath)) fail("DONOR_SURFACE_PATH_MISSING", surfacePath);
    if (!["CAPABILITY", "SUPPORT"].includes(surface?.role)) fail("DONOR_SURFACE_ROLE_INVALID", `${surfacePath}:${surface?.role}`);
    const capability = capabilityById.get(surface?.capabilityId);
    if (!capability) fail("DONOR_SURFACE_CAPABILITY_UNKNOWN", `${surfacePath}:${surface?.capabilityId}`);
    else if (capability.donor !== surface?.donor) fail("DONOR_SURFACE_DONOR_MISMATCH", `${surfacePath}:${surface?.donor}:${capability.donor}`);
  }

  const discoveredSurfaces = donorDerivedSurfaceFiles(root);
  const discoveredSet = new Set(discoveredSurfaces);
  for (const file of discoveredSurfaces) {
    if (!surfacePaths.has(file)) fail("DONOR_SURFACE_UNINVENTORIED", file);
  }
  for (const surfacePath of surfacePaths) {
    if (!discoveredSet.has(surfacePath)) fail("DONOR_SURFACE_STALE", surfacePath);
  }

  const provenanceOnlyPaths = Array.isArray(ledger.provenanceOnlyPaths) ? ledger.provenanceOnlyPaths : [];
  const provenanceSet = new Set(provenanceOnlyPaths);
  for (const provenancePath of provenanceOnlyPaths) {
    if (!pathExists(root, provenancePath)) fail("DONOR_PROVENANCE_PATH_MISSING", provenancePath);
    if (!surfacePaths.has(provenancePath)) fail("DONOR_PROVENANCE_PATH_UNINVENTORIED", provenancePath);
  }
  for (const reference of scanProvenanceModuleReachability(root, provenanceOnlyPaths)) {
    fail("DONOR_PROVENANCE_MODULE_RUNTIME_REACHABLE", `${reference.marker}:${reference.path}`);
  }

  for (const [donorName, donor] of Object.entries(donors)) {
    const summary = donor?.statusSummary;
    for (const status of DONOR_LEDGER_STATUSES) {
      const expected = computed[donorName]?.[status] ?? 0;
      const observed = summary?.[status];
      if (observed !== expected) fail("DONOR_STATUS_SUMMARY_MISMATCH", `${donorName}:${status}:expected=${expected}:observed=${observed}`);
    }
  }

  if (includeRuntimeScan) {
    for (const finding of scanExternalRuntimeDependencies(root)) {
      const provenanceOnlyUrl =
        (finding.kind === "donor-github-source-url" || finding.kind === "donor-github-repository-url") &&
        provenanceSet.has(finding.path);
      if (!provenanceOnlyUrl) fail("EXTERNAL_DONOR_RUNTIME_DEPENDENCY", `${finding.kind}:${finding.path}`);
    }
  }

  return findings;
}

export function verifyDonorLedgerFile(ledgerPath, options = {}) {
  const absolute = path.resolve(ledgerPath);
  const root = options.root ?? process.cwd();
  const content = fs.readFileSync(absolute, "utf8");
  const ledger = JSON.parse(content);
  const findings = validateDonorLedgerObject(ledger, { root, includeRuntimeScan: options.includeRuntimeScan ?? true });
  const checksum = crypto.createHash("sha256").update(content, "utf8").digest("hex");
  return { ok: findings.length === 0, findings, checksum, capabilityCount: Array.isArray(ledger.capabilities) ? ledger.capabilities.length : 0 };
}

function main() {
  const args = process.argv.slice(2);
  const ledgerFlag = args.indexOf("--ledger");
  const ledgerPath = ledgerFlag >= 0 ? args[ledgerFlag + 1] : "architecture/donor-ledger.json";
  if (!ledgerPath) {
    console.error("Missing value after --ledger");
    process.exit(2);
  }
  const result = verifyDonorLedgerFile(ledgerPath);
  if (!result.ok) {
    console.error(JSON.stringify({ recordType: "aurion_donor_ledger_verification.v2", ok: false, findings: result.findings }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    recordType: "aurion_donor_ledger_verification.v2",
    ok: true,
    capabilityCount: result.capabilityCount,
    ledgerSha256: result.checksum,
    externalDonorRuntimeDependencies: 0,
  }, null, 2));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main();
