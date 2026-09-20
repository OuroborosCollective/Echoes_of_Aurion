#!/usr/bin/env tsx
import { readFileSync, statSync } from "node:fs";
import { decodeWorldChunkProjectionManifestV2 } from "../shared/worldChunkProjectionProtocol";

// Offline inspector only until a real authority-to-chunk runtime adapter exists.
// No connection to MariaDB and no arbitrary command or recovery invocation.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--manifest") {
  console.error("Usage: pnpm exec tsx scripts/explain-aurion-projection.ts --manifest <manifest.json>");
  console.error("Runtime --world/--tick/--connection readback is not implemented; it must not be simulated.");
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
