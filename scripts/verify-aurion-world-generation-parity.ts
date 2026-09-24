#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertWorldGenerationEvidence } from "../server/causality/worldGenerationEvidenceContract";
import {
  verifyWorldGenerationArtifactIntegrityHash,
  verifyWorldGenerationDeterminismHash,
} from "../server/causality/worldGenerationEvidenceHash";
import { evidenceToWorldGenerationParityManifest } from "../server/causality/worldGenerationParityManifest";

function usage(): never {
  console.error("Usage: pnpm exec tsx scripts/verify-aurion-world-generation-parity.ts <evidence.json> [--require-match]");
  process.exit(2);
}

const path = process.argv[2];
if (!path) usage();
const requireMatch = process.argv.includes("--require-match");
const payload = await readFile(resolve(path), "utf8");
const evidence = JSON.parse(payload) as unknown;
assertWorldGenerationEvidence(evidence);

if (!verifyWorldGenerationDeterminismHash(evidence)) throw new Error("WORLD_GENERATION_DETERMINISM_HASH_MISMATCH");
if (!verifyWorldGenerationArtifactIntegrityHash(evidence)) throw new Error("WORLD_GENERATION_ARTIFACT_INTEGRITY_HASH_MISMATCH");

if (evidence.runtimeRevision !== evidence.sourceRevision) {
  throw new Error("WORLD_GENERATION_RUNTIME_REVISION_MISMATCH");
}
if (evidence.productionRuntimeIdentity.sourceRevision !== evidence.sourceRevision) {
  throw new Error("WORLD_GENERATION_PRODUCTION_SOURCE_REVISION_MISMATCH");
}
if (evidence.productionRuntimeIdentity.runtimeRevision !== evidence.sourceRevision) {
  throw new Error("WORLD_GENERATION_PRODUCTION_RUNTIME_REVISION_MISMATCH");
}

if (requireMatch && evidence.status !== "MATCH") {
  throw new Error("WORLD_GENERATION_PARITY_NOT_MATCH");
}

process.stdout.write(evidenceToWorldGenerationParityManifest(evidence));
