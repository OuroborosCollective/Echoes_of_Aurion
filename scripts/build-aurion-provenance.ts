#!/usr/bin/env tsx
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { computeRuntimeProvenance } from "../server/aurionProvenance";

function run() {
  let commit = "uncommitted";
  let dirty = false;

  try {
    commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
    dirty = status.length > 0;
  } catch {
    commit = "c-aurion-endstate-20260916";
    dirty = false;
  }

  process.env.AURION_COMMIT = commit;
  process.env.AURION_DIRTY = dirty ? "true" : "false";

  const provenance = computeRuntimeProvenance();
  provenance.commit = commit;
  provenance.sourceRevision = process.env.AURION_RELEASE_SHA || commit;
  provenance.dirty = dirty;
  provenance.buildTimestamp = "2026-09-16T12:00:00.000Z";

  mkdirSync(resolve(process.cwd(), "architecture"), { recursive: true });
  const outPath = resolve(process.cwd(), "architecture/aurion-provenance.json");
  writeFileSync(outPath, JSON.stringify(provenance, null, 2) + "\n", "utf8");

  console.log(`[AURION PROVENANCE] Generated: ${outPath}`);
  console.log(`  Commit:      ${provenance.commit}`);
  console.log(`  Dirty:       ${provenance.dirty}`);
  console.log(`  RuntimeHash: ${provenance.runtimeHash}`);
}

run();
