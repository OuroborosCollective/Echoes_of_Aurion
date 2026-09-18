#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import {
  computeWorldCausalRoot,
  computeZoneEpochRoot,
  type AurionZoneReceiptReference,
} from "../shared/aurionWorldCausalRootContract";
import { worldCausalRootService } from "../server/causality/worldCausalRootService";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const fixturePath = argument("--fixture");
if (fixturePath) {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    worldId: string;
    epoch: number;
    sourceRevision: string;
    rulesetVersion: string;
    expectedZoneIds: string[];
    previousWorldRoot: string | null;
    zoneReceipts: Record<string, AurionZoneReceiptReference[]>;
  };
  const zoneRoots = Object.values(fixture.zoneReceipts).map(computeZoneEpochRoot);
  const result = computeWorldCausalRoot({
    worldId: fixture.worldId,
    epoch: fixture.epoch,
    sourceRevision: fixture.sourceRevision,
    rulesetVersion: fixture.rulesetVersion,
    expectedZoneIds: fixture.expectedZoneIds,
    zoneRoots,
    previousWorldRoot: fixture.previousWorldRoot,
  });
  console.log(JSON.stringify({ mode: "fixture", input: fixture, result }, null, 2));
  process.exit(result.status === "VERIFIED" ? 0 : 2);
}

const worldId = argument("--world");
const epochRaw = argument("--epoch");
if (!worldId || !epochRaw || !Number.isSafeInteger(Number(epochRaw)) || Number(epochRaw) < 1) {
  console.error("Usage: pnpm exec tsx scripts/read-aurion-world-root.ts --world <world-id> --epoch <epoch>");
  console.error("   or: pnpm exec tsx scripts/read-aurion-world-root.ts --fixture <fixture.json>");
  process.exit(64);
}

const epoch = Number(epochRaw);
const stored = await worldCausalRootService.read(worldId, epoch);
if (!stored) {
  console.error(JSON.stringify({ status: "UNPROVABLE", reason: "WORLD_ROOT_EVIDENCE_MISSING", worldId, epoch }));
  process.exit(2);
}
const replay = await worldCausalRootService.replay(worldId, epoch);
console.log(JSON.stringify({ mode: "runtime-readback", worldId, epoch, stored, replay }, null, 2));
if (replay.status === "MATCH") process.exit(0);
if (replay.status === "FIRST_DIVERGENCE") process.exit(1);
process.exit(2);
