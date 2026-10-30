import { createHash } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDb } from "./db";
import { glbImportStore } from "./glbImportStore";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import {
  AURION_AUTHORING_RECEIPT_SCHEMA,
  AURION_DUNGEON_DESIGN_SCHEMA,
  AURION_WORLD_DESIGN_SCHEMA,
  ActiveDungeonDesignSchema,
  AuthoringReceiptSchema,
  DungeonDesignDraftSchema,
  DungeonDesignPlanSchema,
  WorldDesignDraftSchema,
  WorldDesignPlanSchema,
  WorldDesignReadbackSchema,
  type ActiveDungeonDesign,
  type AuthoringReceipt,
  type DungeonDesignDraft,
  type DungeonDesignPlan,
  type WorldDesignDraft,
  type WorldDesignPlan,
  type WorldDesignReadback,
} from "../shared/aurionAuthoringContract";
import {
  aurionAuthoringReceipts,
  aurionDungeonDesignVersions,
  aurionWorldDesignVersions,
  users,
} from "../drizzle/schema";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import { groupDungeonIds } from "../shared/groupInstanceProtocol";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DatabaseLike = Database | Transaction;
const MAX_ACTIVE_WORLD_DESIGNS = 64;
// Both designJson and receipt payloadJson are MariaDB TEXT columns.
const MAX_WORLD_PLAN_BYTES = 65_535;

export function authoringHash(value: unknown): string {
  return createHash("sha256").update(stableCatalogStringify(value), "utf8").digest("hex");
}

function worldAssetAllowed(entry: Awaited<ReturnType<ReturnType<typeof glbImportStore>["catalog"]>>["entries"][number]): boolean {
  return entry.assetType === "arena"
    && entry.targetKey === null
    && (entry.purpose === "world-environment" || entry.purpose === "world-nature");
}

function dungeonAssetAllowed(
  entry: Awaited<ReturnType<ReturnType<typeof glbImportStore>["catalog"]>>["entries"][number],
  role: "room" | "boss",
): boolean {
  if (role === "room") return worldAssetAllowed(entry);
  return entry.targetKey === null && (entry.assetType === "enemy" || entry.assetType === "character");
}

export function validateDungeonDesignTopology(draft: DungeonDesignDraft): void {
  const entrance = draft.rooms.find(room => room.kind === "entrance");
  if (!entrance) throw new Error("AUTHORING_DUNGEON_ENTRANCE_REQUIRED");
  const adjacency = new Map(draft.rooms.map(room => [room.roomKey, [] as string[]]));
  for (const edge of draft.connections) adjacency.get(edge.fromRoomKey)!.push(edge.toRoomKey);
  const visited = new Set<string>();
  const queue = [entrance.roomKey];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) if (!visited.has(next)) queue.push(next);
  }
  if (visited.size !== draft.rooms.length) throw new Error("AUTHORING_DUNGEON_UNREACHABLE_ROOM");
  const exit = draft.rooms.find(room => room.kind === "exit")!;
  if (!visited.has(exit.roomKey)) throw new Error("AUTHORING_DUNGEON_EXIT_UNREACHABLE");
  for (const boss of draft.bosses) {
    const room = draft.rooms.find(candidate => candidate.roomKey === boss.roomKey);
    if (!room || room.kind !== "boss") throw new Error("AUTHORING_DUNGEON_BOSS_ROOM_REQUIRED");
  }
}

function receiptIdentity(input: {
  kind: "world" | "quest" | "dungeon";
  action: "apply" | "publish";
  targetId: string;
  actorUserId: number;
  planHash: string;
  previousHash: string | null;
  resultHash: string;
}) {
  const unsigned = {
    schemaVersion: AURION_AUTHORING_RECEIPT_SCHEMA,
    ...input,
    humanConfirmed: true as const,
  };
  const receiptHash = authoringHash(unsigned);
  return AuthoringReceiptSchema.parse({
    ...unsigned,
    receiptId: `authoring:${input.kind}:${receiptHash.slice(0, 24)}`,
    receiptHash,
  });
}

export async function persistAuthoringReceipt(
  database: DatabaseLike,
  receipt: AuthoringReceipt,
  payload: unknown,
): Promise<void> {
  await database.insert(aurionAuthoringReceipts).values({
    id: receipt.receiptId,
    kind: receipt.kind,
    action: receipt.action,
    targetId: receipt.targetId,
    actorUserId: receipt.actorUserId,
    planHash: receipt.planHash,
    previousHash: receipt.previousHash,
    resultHash: receipt.resultHash,
    payloadJson: stableCatalogStringify(payload),
    receiptHash: receipt.receiptHash,
  }).onDuplicateKeyUpdate({
    set: {
      receiptHash: receipt.receiptHash,
      resultHash: receipt.resultHash,
      payloadJson: stableCatalogStringify(payload),
    },
  });
}

function assertCompatibleWorldVersion(
  existing: typeof aurionWorldDesignVersions.$inferSelect,
  candidate: WorldDesignPlan,
): void {
  const stored = WorldDesignPlanSchema.parse(JSON.parse(existing.designJson));
  if (existing.id !== `${stored.designKey}:v${stored.version}` || existing.designKey !== stored.designKey || existing.version !== stored.version
      || existing.designHash !== authoringHash({ schemaVersion: AURION_WORLD_DESIGN_SCHEMA, plan: stored })) {
    throw new Error("AUTHORING_WORLD_STORED_HASH_INVALID");
  }
  // The predecessor and plan hash identify this operation, not immutable
  // version content. This preserves reactivation of identical old versions.
  const { planHash: _oldHash, expectedPreviousHash: _oldPrevious, ...oldContent } = stored;
  const { planHash: _newHash, expectedPreviousHash: _newPrevious, ...newContent } = candidate;
  if (stableCatalogStringify(oldContent) !== stableCatalogStringify(newContent)) {
    throw new Error("AUTHORING_WORLD_VERSION_CONFLICT");
  }
}

export async function planWorldDesign(raw: WorldDesignDraft, catalogConnection?: PoolConnection): Promise<WorldDesignPlan> {
  const draft = WorldDesignDraftSchema.parse(raw);
  const db = await getDb();
  if (!db) throw new Error("AUTHORING_DATABASE_REQUIRED");
  const catalog = await glbImportStore().catalog(catalogConnection);
  if (catalog.revision !== draft.expectedCatalogRevision) throw new Error("AUTHORING_GLB_CATALOG_CHANGED");
  const referenced = new Set<string>();
  for (const placement of draft.placements) {
    const entry = catalog.entries.find(candidate => candidate.assetId === placement.assetId);
    if (!entry || !worldAssetAllowed(entry)) throw new Error("AUTHORING_WORLD_ASSET_NOT_APPROVED");
    referenced.add(entry.sha256);
  }
  const referencedAssetHashes = [...referenced].sort();
  const active = await db.select().from(aurionWorldDesignVersions)
    .where(eq(aurionWorldDesignVersions.active, true));
  const previous = active.filter(row => row.designKey === draft.designKey);
  if (previous.length > 1) throw new Error("AUTHORING_WORLD_ACTIVE_VERSION_CORRUPT");
  if (active.length > MAX_ACTIVE_WORLD_DESIGNS || (active.length === MAX_ACTIVE_WORLD_DESIGNS && !previous.length)) {
    throw new Error("AUTHORING_WORLD_ACTIVE_LIMIT");
  }
  const identity = { ...draft, referencedAssetHashes, expectedPreviousHash: previous[0]?.designHash ?? null, requiresHumanConfirmation: true as const };
  const plan = WorldDesignPlanSchema.parse({ ...identity, planHash: authoringHash(identity) });
  if (Buffer.byteLength(stableCatalogStringify(plan), "utf8") > MAX_WORLD_PLAN_BYTES) {
    throw new Error("AUTHORING_WORLD_PLAN_TOO_LARGE");
  }
  const id = `${plan.designKey}:v${plan.version}`;
  const existing = (await db.select().from(aurionWorldDesignVersions).where(eq(aurionWorldDesignVersions.id, id)))[0];
  if (existing) assertCompatibleWorldVersion(existing, plan);
  return plan;
}

export async function applyWorldDesign(
  actorUserId: number,
  raw: WorldDesignDraft,
  expectedPlanHash: string,
): Promise<{ receipt: AuthoringReceipt; readback: WorldDesignReadback }> {
  const receipt = await glbImportStore().withCatalogFence(async connection => {
    const plan = await planWorldDesign(raw, connection);
    if (plan.planHash !== expectedPlanHash) throw new Error("AUTHORING_WORLD_PLAN_CHANGED");
    const id = `${plan.designKey}:v${plan.version}`;
    // The lock and transaction intentionally share a physical DB connection.
    const db = drizzle(connection);
    return db.transaction(async tx => {
      const actor = (await tx.select({ role: users.role }).from(users)
        .where(eq(users.id, actorUserId)).for("update"))[0];
      if (actor?.role !== "admin") throw new Error("AUTHORING_ADMIN_REQUIRED");
      const activeWorld = await tx.select().from(aurionWorldDesignVersions)
        .where(eq(aurionWorldDesignVersions.active, true)).for("update");
      const active = activeWorld.filter(row => row.designKey === plan.designKey);
      if (active.length > 1) throw new Error("AUTHORING_WORLD_ACTIVE_VERSION_CORRUPT");
      const previousHash = active[0]?.designHash ?? null;
      if (previousHash !== plan.expectedPreviousHash) throw new Error("AUTHORING_WORLD_PREDECESSOR_CHANGED");
      if (activeWorld.length > MAX_ACTIVE_WORLD_DESIGNS || (activeWorld.length === MAX_ACTIVE_WORLD_DESIGNS && !active.length)) {
        throw new Error("AUTHORING_WORLD_ACTIVE_LIMIT");
      }
      const existing = (await tx.select().from(aurionWorldDesignVersions).where(eq(aurionWorldDesignVersions.id, id)).for("update"))[0];
      if (existing) assertCompatibleWorldVersion(existing, plan);
      const designHash = existing?.designHash ?? authoringHash({ schemaVersion: AURION_WORLD_DESIGN_SCHEMA, plan });
      if (active[0] && active[0].id !== id) {
        await tx.update(aurionWorldDesignVersions).set({ active: false }).where(eq(aurionWorldDesignVersions.id, active[0].id));
      }
      if (!existing) {
        await tx.insert(aurionWorldDesignVersions).values({
          id,
          designKey: plan.designKey,
          version: plan.version,
          worldId: GLOBAL_WORLD_ID,
          title: plan.title,
          expectedCatalogRevision: plan.expectedCatalogRevision,
          designJson: stableCatalogStringify(WorldDesignPlanSchema.parse(plan)),
          designHash,
          active: true,
          createdByUserId: actorUserId,
        });
      } else if (!existing.active) {
        await tx.update(aurionWorldDesignVersions).set({ active: true }).where(eq(aurionWorldDesignVersions.id, id));
      }
      const result = receiptIdentity({
        kind: "world",
        action: "apply",
        targetId: id,
        actorUserId,
        planHash: plan.planHash,
        previousHash,
        resultHash: designHash,
      });
      await persistAuthoringReceipt(tx, result, plan);
      return result;
    });
  });
  return { receipt, readback: await readActiveWorldDesign() };
}

export async function readActiveWorldDesign(database?: DatabaseLike): Promise<WorldDesignReadback> {
  const db = database ?? await getDb();
  if (!db) throw new Error("AUTHORING_DATABASE_REQUIRED");
  const rows = await db.select().from(aurionWorldDesignVersions)
    .where(eq(aurionWorldDesignVersions.active, true))
    .orderBy(asc(aurionWorldDesignVersions.designKey), asc(aurionWorldDesignVersions.version));
  const designs = rows.map(row => {
    const plan = WorldDesignPlanSchema.parse(JSON.parse(row.designJson));
    const expectedDesignHash = authoringHash({ schemaVersion: AURION_WORLD_DESIGN_SCHEMA, plan });
    if (row.designHash !== expectedDesignHash) throw new Error("AUTHORING_WORLD_STORED_HASH_INVALID");
    return {
      designKey: plan.designKey,
      version: plan.version,
      title: plan.title,
      designHash: row.designHash,
      expectedCatalogRevision: plan.expectedCatalogRevision,
      placements: plan.placements,
    };
  });
  return WorldDesignReadbackSchema.parse({
    schemaVersion: AURION_WORLD_DESIGN_SCHEMA,
    revision: authoringHash(designs.map(item => [item.designKey, item.version, item.designHash])),
    designs,
  });
}

export async function planDungeonDesign(raw: DungeonDesignDraft): Promise<DungeonDesignPlan> {
  const draft = DungeonDesignDraftSchema.parse(raw);
  if ((groupDungeonIds as readonly string[]).includes(draft.dungeonId)) throw new Error("AUTHORING_DUNGEON_STATIC_ID_RESERVED");
  validateDungeonDesignTopology(draft);
  const catalog = await glbImportStore().catalog();
  if (catalog.revision !== draft.expectedCatalogRevision) throw new Error("AUTHORING_GLB_CATALOG_CHANGED");
  const referenced = new Set<string>();
  for (const room of draft.rooms) {
    if (!room.assetId) continue;
    const entry = catalog.entries.find(candidate => candidate.assetId === room.assetId);
    if (!entry || !dungeonAssetAllowed(entry, "room")) throw new Error("AUTHORING_DUNGEON_ROOM_ASSET_NOT_APPROVED");
    referenced.add(entry.sha256);
  }
  for (const boss of draft.bosses) {
    if (!boss.assetId) continue;
    const entry = catalog.entries.find(candidate => candidate.assetId === boss.assetId);
    if (!entry || !dungeonAssetAllowed(entry, "boss")) throw new Error("AUTHORING_DUNGEON_BOSS_ASSET_NOT_APPROVED");
    referenced.add(entry.sha256);
  }
  const graphHash = authoringHash({
    rooms: draft.rooms.map(room => [room.roomKey, room.kind, room.xMm, room.zMm]),
    connections: draft.connections,
    bosses: draft.bosses.map(boss => [boss.bossId, boss.roomKey]),
  });
  const referencedAssetHashes = [...referenced].sort();
  const identity = { ...draft, referencedAssetHashes, graphHash, requiresHumanConfirmation: true as const };
  return DungeonDesignPlanSchema.parse({ ...identity, planHash: authoringHash(identity) });
}

export async function applyDungeonDesign(
  actorUserId: number,
  raw: DungeonDesignDraft,
  expectedPlanHash: string,
): Promise<{ receipt: AuthoringReceipt; dungeon: ActiveDungeonDesign }> {
  const plan = await planDungeonDesign(raw);
  if (plan.planHash !== expectedPlanHash) throw new Error("AUTHORING_DUNGEON_PLAN_CHANGED");
  const db = await getDb();
  if (!db) throw new Error("AUTHORING_DATABASE_REQUIRED");
  const designHash = authoringHash({ schemaVersion: AURION_DUNGEON_DESIGN_SCHEMA, plan });
  const id = `${plan.dungeonId}:v${plan.version}`;
  const dungeon = ActiveDungeonDesignSchema.parse({ ...plan, designHash });

  const receipt = await db.transaction(async tx => {
    const active = await tx.select().from(aurionDungeonDesignVersions)
      .where(and(eq(aurionDungeonDesignVersions.dungeonId, plan.dungeonId), eq(aurionDungeonDesignVersions.active, true)))
      .for("update");
    if (active.length > 1) throw new Error("AUTHORING_DUNGEON_ACTIVE_VERSION_CORRUPT");
    const previousHash = active[0]?.designHash ?? null;
    const existing = (await tx.select().from(aurionDungeonDesignVersions).where(eq(aurionDungeonDesignVersions.id, id)).for("update"))[0];
    if (existing && existing.designHash !== designHash) throw new Error("AUTHORING_DUNGEON_VERSION_CONFLICT");
    if (active[0] && active[0].id !== id) await tx.update(aurionDungeonDesignVersions).set({ active: false }).where(eq(aurionDungeonDesignVersions.id, active[0].id));
    if (!existing) {
      await tx.insert(aurionDungeonDesignVersions).values({
        id,
        dungeonId: plan.dungeonId,
        version: plan.version,
        label: plan.label,
        zone: plan.zone,
        expectedCatalogRevision: plan.expectedCatalogRevision,
        designJson: stableCatalogStringify(dungeon),
        designHash,
        active: true,
        createdByUserId: actorUserId,
      });
    } else if (!existing.active) {
      await tx.update(aurionDungeonDesignVersions).set({ active: true }).where(eq(aurionDungeonDesignVersions.id, id));
    }
    const result = receiptIdentity({
      kind: "dungeon",
      action: "publish",
      targetId: id,
      actorUserId,
      planHash: plan.planHash,
      previousHash,
      resultHash: designHash,
    });
    await persistAuthoringReceipt(tx, result, dungeon);
    return result;
  });
  return { receipt, dungeon };
}

export async function readActiveDungeonDesigns(database?: DatabaseLike): Promise<readonly ActiveDungeonDesign[]> {
  const db = database ?? await getDb();
  if (!db) throw new Error("AUTHORING_DATABASE_REQUIRED");
  const rows = await db.select().from(aurionDungeonDesignVersions)
    .where(eq(aurionDungeonDesignVersions.active, true))
    .orderBy(asc(aurionDungeonDesignVersions.dungeonId), desc(aurionDungeonDesignVersions.version));
  const seen = new Set<string>();
  const result: ActiveDungeonDesign[] = [];
  for (const row of rows) {
    if (seen.has(row.dungeonId)) continue;
    const parsed = ActiveDungeonDesignSchema.parse(JSON.parse(row.designJson));
    if (parsed.dungeonId !== row.dungeonId || parsed.version !== row.version || parsed.designHash !== row.designHash) throw new Error("AUTHORING_DUNGEON_STORED_IDENTITY_INVALID");
    seen.add(row.dungeonId);
    result.push(parsed);
  }
  return Object.freeze(result);
}

export async function readActiveDungeonDesign(dungeonId: string, database?: DatabaseLike): Promise<ActiveDungeonDesign | null> {
  const list = await readActiveDungeonDesigns(database);
  return list.find(item => item.dungeonId === dungeonId) ?? null;
}

export function createQuestPublishReceipt(input: {
  actorUserId: number;
  proposalId: string;
  planHash: string;
  previousHash: string | null;
  resultHash: string;
}): AuthoringReceipt {
  return receiptIdentity({
    kind: "quest",
    action: "publish",
    targetId: input.proposalId,
    actorUserId: input.actorUserId,
    planHash: input.planHash,
    previousHash: input.previousHash,
    resultHash: input.resultHash,
  });
}
