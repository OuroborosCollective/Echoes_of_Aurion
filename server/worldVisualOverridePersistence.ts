import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { aurionWorldVisualOverrides } from "../drizzle/schema";
import { getDb } from "./db";
import { glbImportStore } from "./glbImportStore";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import {
  WORLD_VISUAL_OVERRIDE_SCHEMA,
  worldVisualTargetKind,
  type WorldVisualOverride,
  type WorldVisualOverrideReadback,
} from "../shared/worldVisualOverrideContract";

/** Bounded readback: overrides are hand-authored by an administrator. */
const MAX_OVERRIDE_ROWS = 20_000;

function receiptHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Current visual override per placement (latest revision; a null asset restores the
 * original). Read by every client to project the persisted world appearance.
 */
export async function readWorldVisualOverrides(worldId = GLOBAL_WORLD_ID): Promise<WorldVisualOverrideReadback> {
  const db = await getDb();
  if (!db) throw new Error("WORLD_VISUAL_DATABASE_REQUIRED");
  const rows = await db.select().from(aurionWorldVisualOverrides)
    .where(eq(aurionWorldVisualOverrides.worldId, worldId))
    .orderBy(desc(aurionWorldVisualOverrides.revision)).limit(MAX_OVERRIDE_ROWS);
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!latest.has(row.placementRef)) latest.set(row.placementRef, row);
  const overrides: WorldVisualOverride[] = [...latest.values()]
    .filter(row => row.assetId !== null)
    .map(row => Object.freeze({ placementRef: row.placementRef, targetKind: row.targetKind, assetId: row.assetId!, revision: row.revision }))
    .sort((left, right) => (left.placementRef < right.placementRef ? -1 : left.placementRef > right.placementRef ? 1 : 0));
  // Revisions are needed for optimistic writes even where the latest revision restored the original.
  const revisions = Object.fromEntries([...latest.values()].map(row => [row.placementRef, row.revision]));
  const readback = { schemaVersion: WORLD_VISUAL_OVERRIDE_SCHEMA, worldId, overrides, revisions };
  return Object.freeze({ ...readback, readbackHash: receiptHash(readback) });
}

/**
 * Admin write: replace (or with assetId null, restore) the visual of one placement.
 * Optimistic: expectedRevision must equal the placement's current revision (0 when it
 * was never overridden). The asset must be an approved world asset in the runtime
 * catalog, so every client can actually load it.
 */
export async function setWorldVisualOverride(actorUserId: number, input: Readonly<{ placementRef: string; assetId: string | null; expectedRevision: number }>, worldId = GLOBAL_WORLD_ID) {
  const targetKind = worldVisualTargetKind(input.placementRef);
  if (!targetKind) throw new Error("WORLD_VISUAL_PLACEMENT_INVALID");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("WORLD_VISUAL_REVISION_INVALID");
  if (input.assetId !== null) {
    const catalog = await glbImportStore().catalog();
    const asset = catalog.entries.find(entry => entry.assetId === input.assetId);
    if (!asset) throw new Error("WORLD_VISUAL_ASSET_NOT_IN_RUNTIME_CATALOG");
    if (asset.assetType !== "arena" || asset.targetKey !== null) throw new Error("WORLD_VISUAL_ASSET_NOT_A_WORLD_ASSET");
  }
  const db = await getDb();
  if (!db) throw new Error("WORLD_VISUAL_DATABASE_REQUIRED");
  return db.transaction(async tx => {
    // Locking read of the placement's head serializes concurrent admin writes.
    const head = (await tx.select().from(aurionWorldVisualOverrides)
      .where(and(eq(aurionWorldVisualOverrides.worldId, worldId), eq(aurionWorldVisualOverrides.placementRef, input.placementRef)))
      .orderBy(desc(aurionWorldVisualOverrides.revision)).limit(1).for("update"))[0];
    const currentRevision = head?.revision ?? 0;
    if (currentRevision !== input.expectedRevision) throw new Error("WORLD_VISUAL_REVISION_CONFLICT");
    const previousAssetId = head?.assetId ?? null;
    if (previousAssetId === input.assetId) throw new Error("WORLD_VISUAL_UNCHANGED");
    const revision = currentRevision + 1;
    const core = { schemaVersion: WORLD_VISUAL_OVERRIDE_SCHEMA, worldId, targetKind, placementRef: input.placementRef, revision, assetId: input.assetId, previousAssetId, actorUserId };
    const hash = receiptHash(core);
    const id = `wvo_${hash.slice(0, 56)}`;
    await tx.insert(aurionWorldVisualOverrides).values({ id, worldId, targetKind, placementRef: input.placementRef, revision, assetId: input.assetId, previousAssetId, actorUserId, receiptHash: hash });
    const row = (await tx.select().from(aurionWorldVisualOverrides).where(eq(aurionWorldVisualOverrides.id, id)).limit(1))[0];
    if (!row || row.receiptHash !== hash || row.revision !== revision || row.assetId !== input.assetId) throw new Error("WORLD_VISUAL_READBACK_MISMATCH");
    return Object.freeze({ ...core, receiptId: id, receiptHash: hash });
  });
}
