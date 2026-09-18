#!/usr/bin/env tsx
import { worldCausalRootService } from "../server/causality/worldCausalRootService";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const worldId = argument("--world");
const epochRaw = argument("--epoch");
if (!worldId || !epochRaw || !Number.isSafeInteger(Number(epochRaw)) || Number(epochRaw) < 1) {
  console.error("Usage: pnpm exec tsx scripts/read-aurion-world-root.ts --world <world-id> --epoch <epoch>");
  process.exit(64);
}

const epoch = Number(epochRaw);
const stored = await worldCausalRootService.read(worldId, epoch);
if (!stored) {
  console.error(JSON.stringify({ status: "UNPROVABLE", reason: "WORLD_ROOT_EVIDENCE_MISSING", worldId, epoch }));
  process.exit(2);
}
const replay = await worldCausalRootService.replay(worldId, epoch);
console.log(JSON.stringify({ worldId, epoch, stored, replay }, null, 2));
if (replay.status === "MATCH") process.exit(0);
if (replay.status === "FIRST_DIVERGENCE") process.exit(1);
process.exit(2);
