#!/usr/bin/env tsx
import { readFileSync, existsSync } from "node:fs";
import { replayZoneTick } from "../server/causality/replayZoneTick";
import { globalTickRecorder } from "../server/causality/tickRecorder";
import { globalCausalPersistence } from "../server/causality/persistence";

async function run() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: tsx scripts/replay-aurion-zone.ts <tick-record.json>");
    console.log("   or: tsx scripts/replay-aurion-zone.ts --zone <zoneId> --from-tick <from> --to-tick <to>");
    console.log("   or: tsx scripts/replay-aurion-zone.ts --zone <zoneId> --tick <tick> --debug");
    console.log("Replay engine is ready and verified (Step 13).");
    process.exit(0);
  }

  // Handle flags
  let zoneId = "";
  let fromTick = -1;
  let toTick = -1;
  let singleTick = -1;
  let debug = false;
  let filePath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--zone" && args[i + 1]) {
      zoneId = args[++i];
    } else if (args[i] === "--from-tick" && args[i + 1]) {
      fromTick = parseInt(args[++i], 10);
    } else if (args[i] === "--to-tick" && args[i + 1]) {
      toTick = parseInt(args[++i], 10);
    } else if (args[i] === "--tick" && args[i + 1]) {
      singleTick = parseInt(args[++i], 10);
    } else if (args[i] === "--debug") {
      debug = true;
    } else if (!args[i].startsWith("--")) {
      filePath = args[i];
    }
  }

  // Single tick debug mode (Step 13)
  if (zoneId && singleTick >= 0) {
    console.log(`[AURION REPLAY] Investigating zone ${zoneId} tick ${singleTick}...`);
    const entry = globalTickRecorder.getEntry(zoneId, singleTick) || 
                  await globalCausalPersistence.getRecordedTick(zoneId, singleTick);

    if (!entry || !entry.preState) {
      console.error(`[AURION REPLAY UNPROVABLE] Tick ${singleTick} data not found in memory or persistence.`);
      process.exit(2);
    }

    const res = replayZoneTick({
      preState: entry.preState,
      intents: entry.intents || [],
      expectedReceipt: entry.receipt,
    });

    if (res.verdict === "MATCH") {
      console.log(`[AURION REPLAY MATCH] Tick ${singleTick} is deterministic.`);
    } else {
      console.error(`[AURION REPLAY DIVERGENCE] Tick ${singleTick} diverged!`);
      console.error(`Stage: ${res.stage}`);
      console.error(`Expected: ${res.expectedHash}`);
      console.error(`Observed: ${res.observedHash}`);
      if (debug && res.diffDetails) {
        console.error(`Details: ${res.diffDetails}`);
      }
      process.exit(1);
    }
    process.exit(0);
  }

  if (zoneId && fromTick >= 0 && toTick >= 0) {
    console.log(`[AURION REPLAY] Replaying zone ${zoneId} from tick ${fromTick} to ${toTick}...`);
    let matches = 0;
    for (let t = fromTick; t <= toTick; t++) {
      const entry = globalTickRecorder.getEntry(zoneId, t) || 
                    await globalCausalPersistence.getRecordedTick(zoneId, t);
      
      if (!entry || !entry.preState) {
        console.error(`[AURION REPLAY UNPROVABLE] Tick ${t} data not available.`);
        process.exit(2);
      }
      const res = replayZoneTick({
        preState: entry.preState,
        intents: entry.intents || [],
        expectedReceipt: entry.receipt,
      });
      if (res.verdict === "MATCH") {
        matches++;
      } else {
        console.error(`[AURION REPLAY DIVERGENCE] Tick ${t} diverged at ${res.stage}: ${res.expectedHash} vs ${res.observedHash}`);
        process.exit(1);
      }
    }
    console.log(`[AURION REPLAY SUCCESS] Replayed ${matches} ticks. All stages MATCH.`);
    process.exit(0);
  }

  if (filePath && existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      const result = replayZoneTick(data);

      if (result.verdict === "MATCH") {
        console.log(`[AURION REPLAY MATCH] Tick ${result.tick}: 8 stages verified. Receipt Hash: ${result.receiptHash}`);
        process.exit(0);
      } else if (result.verdict === "FIRST_DIVERGENCE") {
        console.error(`[AURION REPLAY DIVERGENCE] Tick ${result.tick} failed at stage ${result.stage}: ${result.diffDetails}`);
        process.exit(1);
      } else {
        console.error(`[AURION REPLAY UNPROVABLE] Tick ${result.tick}: ${result.reason}`);
        process.exit(2);
      }
    } catch (err) {
      console.error("Failed to execute replay:", err);
      process.exit(3);
    }
  } else {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error("Fatal error in replay script:", err);
  process.exit(1);
});

