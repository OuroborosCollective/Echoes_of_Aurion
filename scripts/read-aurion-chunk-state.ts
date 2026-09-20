#!/usr/bin/env tsx
import { worldCausalRootService } from "../server/causality/worldCausalRootService";

const args = process.argv.slice(2);
const fields = new Map<string, string>();
const allowed = ["--world", "--epoch", "--chunk-x", "--chunk-z"];
for (let i = 0; i < args.length; i += 2) {
  if (!allowed.includes(args[i]!) || !args[i + 1] || fields.has(args[i]!)) {
    console.error("Invalid or duplicate argument"); process.exit(64);
  }
  fields.set(args[i]!, args[i + 1]!);
}
const worldId = fields.get("--world");
const epoch = Number(fields.get("--epoch"));
const x = Number(fields.get("--chunk-x"));
const z = Number(fields.get("--chunk-z"));
if (fields.size !== 4 || !worldId || !Number.isSafeInteger(epoch) || epoch < 1 ||
    !Number.isSafeInteger(x) || !Number.isSafeInteger(z) || Math.abs(x) > 1_000_000 || Math.abs(z) > 1_000_000) {
  console.error("Usage: pnpm exec tsx scripts/read-aurion-chunk-state.ts --world <world> --epoch <epoch> --chunk-x <x> --chunk-z <z>");
  process.exit(64);
}
try {
  const result = await worldCausalRootService.readChunk(worldId, epoch, { x, z });
  // Do not print generated geometry, actor identities, intent keys or DB errors.
  console.log(JSON.stringify(result.status === "VERIFIED" ? {
    mode: "persisted-epoch-chunk-readback", status: result.status, membership: result.membership,
    worldRootHash: result.worldRootHash, receipt: result.receipt,
    reconstructedStateHash: result.state.authorityStateHash, mutationAuthority: "none",
  } : { mode: "persisted-epoch-chunk-readback", ...result, mutationAuthority: "none" }, null, 2));
  process.exit(result.status === "VERIFIED" ? 0 : 2);
} catch {
  console.error(JSON.stringify({ status: "UNPROVABLE", reason: "CHUNK_READBACK_UNAVAILABLE", mutationAuthority: "none" }));
  process.exit(2);
}
