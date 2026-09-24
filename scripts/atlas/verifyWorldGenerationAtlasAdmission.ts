#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateGeneratedWorldAtlasInput } from "./worldGenerationAtlasAdmission";

const evidencePath = process.argv.find(arg => !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1])
  ?? "aurion-world-generation-parity-510.json";

const raw = await readFile(resolve(evidencePath), "utf8");
const evidence = JSON.parse(raw) as unknown;

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`ATLAS_EVIDENCE_GATE_${name}_REQUIRED`);
  return value;
};

const admission = evaluateGeneratedWorldAtlasInput(evidence, {
  expectedWorldId: required("AURION_EXPECTED_WORLD_ID"),
  expectedSourceRevision: required("AURION_EXPECTED_SOURCE_REVISION"),
  expectedRuntimeRevision: required("AURION_EXPECTED_RUNTIME_REVISION"),
  expectedRuntimeImageDigest: required("AURION_EXPECTED_RUNTIME_IMAGE_DIGEST"),
  expectedCausalTickSchema: required("AURION_EXPECTED_CAUSAL_TICK_SCHEMA"),
  expectedRulesetVersion: required("AURION_EXPECTED_RULESET_VERSION"),
});

if (admission.verdict !== "ADMIT") {
  throw new Error(`ATLAS_WORLD_GENERATION_EVIDENCE_GATE_${admission.reason}`);
}

process.stdout.write(JSON.stringify(admission, null, 2) + "\n");
