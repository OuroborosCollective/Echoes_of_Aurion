import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { aurionWorldVisualOverrides } from "../drizzle/schema";
import { getDb } from "./db";
import { glbImportStore } from "./glbImportStore";
import { GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED } from "../shared/worldIdentity";
import { isPlaceableWorldAsset } from "../shared/adminPlacementPlan";
import { findProceduralPlacement } from "../shared/worldAssetProtocol";
import {
  WORLD_VISUAL_OVERRIDE_SCHEMA,
  isWorldVisualRemoval,
  shippedPlacementIdOf,
  worldVisualTargetIsRemovable,
  worldVisualTargetKind,
  type WorldVisualOverride,
  type WorldVisualOverrideReadback,
} from "../shared/worldVisualOverrideContract";
import { applyShippedPlacementReadback, applyShippedPlacementWrite } from "./worldShippedPlacementOverrides";

/**
 * Bound on distinct addressed placements (hand-authored by an administrator). Writes
 * refuse a new placement at the bound; the readback fails explicitly instead of ever
 * returning an incomplete world (the slack absorbs concurrent first writes).
 */
export const MAX_WORLD_VISUAL_PLACEMENTS = 20_000;
const READBACK_SLACK = 64;

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
  // Latest revision per placement first (unique (worldId, placementRef, revision) index),
  // so a long history of one placement can never hide another placement's head.
  const table = aurionWorldVisualOverrides;
  const heads = db.select({ placementRef: table.placementRef, headRevision: sql<number>`MAX(${table.revision})`.as("headRevision") })
    .from(table).where(eq(table.worldId, worldId)).groupBy(table.placementRef).as("heads");
  const joined = await db.select({ row: table }).from(table)
    .innerJoin(heads, and(eq(table.placementRef, heads.placementRef), eq(table.revision, heads.headRevision)))
    .where(eq(table.worldId, worldId))
    .limit(MAX_WORLD_VISUAL_PLACEMENTS + READBACK_SLACK + 1);
  if (joined.length > MAX_WORLD_VISUAL_PLACEMENTS + READBACK_SLACK) throw new Error("WORLD_VISUAL_READBACK_OVERFLOW");
  const readback = buildWorldVisualOverrideReadback(worldId, joined.map(({ row }) => row));
  // Every confirmed readback of the global world refreshes the derived placement index.
  applyShippedPlacementReadback(readback);
  return readback;
}

const DEADLOCK_ATTEMPTS = 4;
const isDeadlock = (error: unknown): boolean => {
  for (let current: unknown = error, depth = 0; current && depth < 4; current = (current as { cause?: unknown }).cause, depth++) {
    const { code, errno } = current as { code?: unknown; errno?: unknown };
    if (code === "ER_LOCK_DEADLOCK" || errno === 1213) return true;
  }
  return false;
};
/**
 * Two admins writing two never-touched placements at the same moment hold the same
 * index gap and InnoDB rolls one transaction back completely. Nothing was written, so
 * the same optimistic transaction is simply run again (it re-reads the revision).
 * Bounded: after the last attempt the admin gets the stable code WORLD_VISUAL_WRITE_BUSY.
 */
async function retryOnDeadlock<T>(transaction: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await transaction(); } catch (error) {
      if (!isDeadlock(error)) throw error;
      if (attempt >= DEADLOCK_ATTEMPTS) throw new Error("WORLD_VISUAL_WRITE_BUSY");
      // Only the rolled-back victim waits; the winner has already committed, so a fixed
      // growing pause suffices (no ambient randomness in Aurion application logic).
      await new Promise(resolve => setTimeout(resolve, 20 * attempt));
    }
  }
}

type OverrideHead = Readonly<{ placementRef: string; targetKind: WorldVisualOverride["targetKind"]; assetId: string | null; revision: number }>;
const byPlacementRef = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Canonical readback of the placement heads. Independent of the database row order:
 * clients compare `readbackHash` to skip unchanged refreshes, so equal data must hash equally.
 */
export function buildWorldVisualOverrideReadback(worldId: string, heads: readonly OverrideHead[]): WorldVisualOverrideReadback {
  const ordered = [...heads].sort((left, right) => byPlacementRef(left.placementRef, right.placementRef));
  const overrides: WorldVisualOverride[] = ordered
    .filter(row => row.assetId !== null)
    .map(row => Object.freeze({ placementRef: row.placementRef, targetKind: row.targetKind, assetId: row.assetId!, revision: row.revision }));
  // Revisions are needed for optimistic writes even where the latest revision restored the original.
  const revisions = Object.fromEntries(ordered.map(row => [row.placementRef, row.revision] as const));
  const readback = { schemaVersion: WORLD_VISUAL_OVERRIDE_SCHEMA, worldId, overrides, revisions };
  return Object.freeze({ ...readback, readbackHash: receiptHash(readback) });
}

/**
 * Admin write: replace, remove (`WORLD_VISUAL_REMOVED_ASSET_ID`) or, with assetId null,
 * restore the visual of one placement.
 * Optimistic: expectedRevision must equal the placement's current revision (0 when it
 * was never overridden). A replacement must be an approved world asset in the runtime
 * catalog, so every client can actually load it. A `shipped:` reference must address a
 * placement the Aurion world plan really emits (never the authored starter village).
 */
export async function setWorldVisualOverride(actorUserId: number, input: Readonly<{ placementRef: string; assetId: string | null; expectedRevision: number }>, worldId = GLOBAL_WORLD_ID) {
  const targetKind = worldVisualTargetKind(input.placementRef);
  if (!targetKind) throw new Error("WORLD_VISUAL_PLACEMENT_INVALID");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("WORLD_VISUAL_REVISION_INVALID");
  const shippedPlacementId = shippedPlacementIdOf(input.placementRef);
  // Restoring stays possible even when a later world plan no longer emits the placement.
  if (input.assetId !== null && shippedPlacementId !== null && !findProceduralPlacement(GLOBAL_WORLD_SEED, shippedPlacementId)) throw new Error("WORLD_VISUAL_PLACEMENT_UNKNOWN");
  if (isWorldVisualRemoval(input.assetId)) {
    if (!worldVisualTargetIsRemovable(targetKind)) throw new Error("WORLD_VISUAL_REMOVAL_UNSUPPORTED");
  } else if (input.assetId !== null) {
    const catalog = await glbImportStore().catalog();
    const asset = catalog.entries.find(entry => entry.assetId === input.assetId);
    if (!asset) throw new Error("WORLD_VISUAL_ASSET_NOT_IN_RUNTIME_CATALOG");
    // The single free-standing world model rule (also used by World Designs and the projection).
    if (!isPlaceableWorldAsset(asset)) throw new Error("WORLD_VISUAL_ASSET_NOT_A_WORLD_ASSET");
  }
  const db = await getDb();
  if (!db) throw new Error("WORLD_VISUAL_DATABASE_REQUIRED");
  const receipt = await retryOnDeadlock(() => db.transaction(async tx => {
    // Locking read of the placement's head serializes concurrent admin writes.
    const head = (await tx.select().from(aurionWorldVisualOverrides)
      .where(and(eq(aurionWorldVisualOverrides.worldId, worldId), eq(aurionWorldVisualOverrides.placementRef, input.placementRef)))
      .orderBy(desc(aurionWorldVisualOverrides.revision)).limit(1).for("update"))[0];
    const currentRevision = head?.revision ?? 0;
    if (currentRevision !== input.expectedRevision) throw new Error("WORLD_VISUAL_REVISION_CONFLICT");
    if (!head) {
      const [count] = await tx.select({ placements: sql<number>`COUNT(DISTINCT ${aurionWorldVisualOverrides.placementRef})` })
        .from(aurionWorldVisualOverrides).where(eq(aurionWorldVisualOverrides.worldId, worldId));
      if (Number(count?.placements ?? 0) >= MAX_WORLD_VISUAL_PLACEMENTS) throw new Error("WORLD_VISUAL_PLACEMENT_LIMIT");
    }
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
  }));
  // Committed: the region read and movement collision follow without a restart.
  applyShippedPlacementWrite(worldId, input.placementRef, input.assetId);
  return receipt;
}
