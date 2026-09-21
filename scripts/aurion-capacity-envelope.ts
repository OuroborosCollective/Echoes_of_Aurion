#!/usr/bin/env tsx
import { globalCapacityEnvelopeService } from "../server/performance/capacityEnvelopeService";

function main() {
  const epoch = 18422;
  const report = globalCapacityEnvelopeService.generateFullEnvelope(epoch);

  console.log("=== AURION CAPACITY ENVELOPE REPORT ===");
  console.log(`Timestamp Epoch: ${report.timestampEpoch}`);
  console.log(`Saturation Boundary: ${report.saturationBoundaryPlayerCount} players / ${report.saturationBoundaryNpcCount} NPCs`);
  console.log(`Sharding Justified: ${report.shardingRequired}`);
  console.log(`Verdict: ${report.verdict}`);
  console.log("\nScenarios Breakdown:");
  for (const s of report.scenarios) {
    console.log(` - [${s.scenarioId}] (${s.playerCount} players, ${s.npcCount} NPCs): Tick p95=${s.tickDurationP95Ms}ms | Status=${s.status} | Hash=${s.measurementHash.slice(0, 12)}...`);
  }
}

main();
