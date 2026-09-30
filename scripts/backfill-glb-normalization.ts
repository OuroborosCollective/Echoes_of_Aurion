import { createPool, type RowDataPacket } from "mysql2/promise";
import { glbImportStore } from "../server/glbImportStore";

export type GlbBackfillMode = "audit" | "apply" | "readback";

export function parseBackfillArgs(argv: readonly string[]): {
  mode: GlbBackfillMode;
  expectedMissingCount: number;
} {
  let mode: GlbBackfillMode = "audit";
  let expectedMissingCount = 86;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mode") {
      const value = argv[++index];
      if (value !== "audit" && value !== "apply" && value !== "readback")
        throw new Error("GLB_NORMALIZATION_BACKFILL_MODE_INVALID");
      mode = value;
      continue;
    }
    if (argument === "--expected-missing-count") {
      const value = argv[++index];
      if (!/^(?:0|[1-9][0-9]*)$/.test(value ?? ""))
        throw new Error("GLB_NORMALIZATION_BACKFILL_COUNT_INVALID");
      expectedMissingCount = Number(value);
      if (!Number.isSafeInteger(expectedMissingCount))
        throw new Error("GLB_NORMALIZATION_BACKFILL_COUNT_INVALID");
      continue;
    }
    throw new Error("GLB_NORMALIZATION_BACKFILL_ARGUMENT_INVALID");
  }
  return { mode, expectedMissingCount };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL_REQUIRED");

  const args = parseBackfillArgs(process.argv.slice(2));
  const pool = createPool(databaseUrl);
  const store = glbImportStore();

  try {
    const [admins] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1",
    );
    const adminUserId = Number(admins[0]?.id);
    if (!Number.isSafeInteger(adminUserId) || adminUserId < 1)
      throw new Error("GLB_NORMALIZATION_BACKFILL_ADMIN_REQUIRED");

    const expected =
      args.mode === "readback" ? 0 : args.expectedMissingCount;
    const operation =
      args.mode === "audit" || args.mode === "readback"
        ? await store.inspectMissingNormalization(adminUserId, expected)
        : await store.backfillMissingNormalization(adminUserId, expected);

    const [counts] = await pool.query<RowDataPacket[]>(
      "SELECT " +
        "COUNT(*) AS approvedLocal, " +
        "SUM(CASE WHEN normalizationRevision IS NOT NULL AND normalizationSha256 IS NOT NULL AND normalizationManifest IS NOT NULL THEN 1 ELSE 0 END) AS physicalCatalogEligible " +
        "FROM glbAssets " +
        "WHERE status = 'approved' AND storageKey LIKE 'local-glb/%'",
    );
    const physicalCatalogEligible = Number(
      counts[0]?.physicalCatalogEligible ?? 0,
    );
    const approvedLocal = Number(counts[0]?.approvedLocal ?? 0);

    const catalog = await store.catalog();
    const result = {
      schemaVersion: 1,
      recordType: "aurion_glb_normalization_backfill",
      mode: args.mode,
      expectedMissingCount: expected,
      operation: {
        scanned: operation.scanned,
        updated: operation.updated,
        receiptSha256: operation.receiptSha256,
      },
      approvedLocal,
      physicalCatalogEligible,
      logicalCatalogEntries: catalog.entries.length,
      catalogRevision: catalog.revision,
    };
    process.stdout.write(JSON.stringify(result) + "\n");

    if (
      args.mode === "apply" &&
      (operation.updated !== expected ||
        physicalCatalogEligible !== approvedLocal ||
        catalog.entries.length < 1)
    )
      throw new Error("GLB_NORMALIZATION_BACKFILL_POSTCONDITION_FAILED");
    if (
      args.mode === "readback" &&
      (operation.scanned !== 0 ||
        physicalCatalogEligible !== approvedLocal ||
        catalog.entries.length < 1)
    )
      throw new Error("GLB_NORMALIZATION_BACKFILL_READBACK_FAILED");
  } finally {
    await store.close();
    await pool.end();
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href)
  main().catch(error => {
    process.stderr.write(
      String(error instanceof Error ? error.message : error) + "\n",
    );
    process.exitCode = 1;
  });
