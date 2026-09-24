#!/usr/bin/env tsx
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildGeneratedWorldAtlasPlan,
} from "./generatedWorldAtlasPlan";

const evidencePath = process.argv[2];
const atlasInputPath = process.argv[3];
const outputPath = process.argv[4] ?? null;

if (!evidencePath || !atlasInputPath) {
  console.error("Usage: pnpm exec tsx scripts/atlas/buildGeneratedWorldAtlasPlan.ts <evidence.json> <atlas-input.json> [output.json]");
  process.exit(2);
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`ATLAS_PLAN_${name}_REQUIRED`);
  return value;
};

const [evidenceRaw, atlasRaw] = await Promise.all([
  readFile(resolve(evidencePath), "utf8"),
  readFile(resolve(atlasInputPath), "utf8"),
]);

const output = buildGeneratedWorldAtlasPlan({
  evidence: JSON.parse(evidenceRaw) as unknown,
  gateContext: {
    expectedWorldId: required("AURION_EXPECTED_WORLD_ID"),
    expectedSourceRevision: required("AURION_EXPECTED_SOURCE_REVISION"),
    expectedRuntimeRevision: required("AURION_EXPECTED_RUNTIME_REVISION"),
    expectedRuntimeImageDigest: required("AURION_EXPECTED_RUNTIME_IMAGE_DIGEST"),
    expectedCausalTickSchema: required("AURION_EXPECTED_CAUSAL_TICK_SCHEMA"),
    expectedRulesetVersion: required("AURION_EXPECTED_RULESET_VERSION"),
  },
  atlas: JSON.parse(atlasRaw) as Record<string, unknown>,
});

const serialized = JSON.stringify(output, null, 2) + "\n";
if (outputPath) await writeFile(resolve(outputPath), serialized, "utf8");
else process.stdout.write(serialized);
