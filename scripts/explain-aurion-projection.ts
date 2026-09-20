#!/usr/bin/env tsx
import { readFileSync, statSync } from "node:fs";
import { decodeWorldChunkProjectionManifestV2 } from "../shared/worldChunkProjectionProtocol";
import { readConfirmedChunkAssetProjection } from "../server/causality/worldChunkProjectionService";

// Read-only persisted epoch projection, or explicitly unverified offline integrity.
// Neither mode invokes a gameplay command, epoch resolver or recovery action.
const args = process.argv.slice(2);
if (args.length === 8 && args[0] === "--world" && args[2] === "--epoch" && args[4] === "--chunk-x" && args[6] === "--chunk-z") {
  const epoch = Number(args[3]), x = Number(args[5]), z = Number(args[7]);
  if (!Number.isSafeInteger(epoch) || epoch < 1 || !Number.isSafeInteger(x) || !Number.isSafeInteger(z) || Math.abs(x) > 1_000_000 || Math.abs(z) > 1_000_000) process.exit(64);
  try {
    const result = await readConfirmedChunkAssetProjection(args[1]!, epoch, { x, z });
    const { payloadJson: _payload, ...evidence } = result.status === "VERIFIED" ? result : { ...result, payloadJson: null };
    console.log(JSON.stringify({ mode: "persisted-epoch-projection", ...evidence }));
    process.exit(result.status === "VERIFIED" ? 0 : 2);
  } catch { console.error(JSON.stringify({ status: "UNPROVABLE", reason: "PROJECTION_READBACK_UNAVAILABLE" })); process.exit(2); }
}
if (args.length !== 2 || args[0] !== "--manifest") {
  console.error("Usage: pnpm exec tsx scripts/explain-aurion-projection.ts --manifest <manifest.json>");
  console.error("Runtime: node --import tsx scripts/explain-aurion-projection.ts --world <id> --epoch <n> --chunk-x <x> --chunk-z <z>");
  process.exit(64);
}
try {
  if (!statSync(args[1]!).isFile() || statSync(args[1]!).size > 16_384) throw new Error("PROJECTION_MANIFEST_FILE_INVALID");
  const manifest = await decodeWorldChunkProjectionManifestV2(JSON.parse(readFileSync(args[1]!, "utf8")));
  console.log(JSON.stringify({
    mode: "offline-manifest-integrity", integrity: "MATCH", authorityStatus: "UNPROVABLE",
    reason: "AUTHORITY_STATE_RECEIPT_MEMBERSHIP_AND_RUNTIME_APPLY_NOT_OBSERVED",
    manifest,
  }, null, 2));
  // A matching commitment alone intentionally does not produce a green authority exit.
  process.exitCode = 2;
} catch {
  console.error(JSON.stringify({ mode: "offline-manifest-integrity", integrity: "INVALID", authorityStatus: "UNPROVABLE" }));
  process.exitCode = 1;
}
