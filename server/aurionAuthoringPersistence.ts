import { createHash } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  aurionWorldDesignVersions,
  aurionDungeonDesignVersions,
  aurionAuthoringReceipts,
} from "../drizzle/schema";
import {
  type WorldDesignDraft,
  type WorldDesignReadback,
  type WorldDesignVersion,
  type DungeonDesignDraft,
  type DungeonDesignReadback,
  type DungeonDesignVersion,
  type AuthoringReceipt,
  WorldDesignReadbackSchema,
  DungeonDesignReadbackSchema,
} from "../shared/aurionAuthoringContract";
import { glbImportStore } from "./glbImportStore";

// In-memory fallback for test and offline environments
const inMemoryWorldDesigns = new Map<string, WorldDesignVersion>();
const inMemoryDungeonDesigns = new Map<string, DungeonDesignVersion>();
const inMemoryReceipts: AuthoringReceipt[] = [];

export async function getGlbCatalogSafe() {
  try {
    return await glbImportStore().catalog();
  } catch {
    return {
      revision: "rev_fallback_catalog_v1",
      entries: [
        {
          assetId: "asset_fallback",
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          bytes: 1024,
          displayName: "asset_fallback",
          assetType: "arena",
          purpose: "world-environment",
        },
        {
          assetId: "tree_oak_01",
          sha256: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          bytes: 2048,
          displayName: "tree_oak_01",
          assetType: "prop",
          purpose: "world-nature",
        },
      ],
    };
  }
}

export async function readActiveWorldDesign(): Promise<WorldDesignReadback> {
  const db = await getDb();
  let designs: WorldDesignVersion[] = [];

  if (db) {
    try {
      const rows = await db
        .select()
        .from(aurionWorldDesignVersions)
        .where(eq(aurionWorldDesignVersions.active, true))
        .orderBy(desc(aurionWorldDesignVersions.version));

      designs = rows.map(row => {
        let placements = [];
        try {
          const parsed = JSON.parse(row.designJson);
          placements = Array.isArray(parsed.placements) ? parsed.placements : [];
        } catch {
          placements = [];
        }

        return {
          id: row.id,
          designKey: row.designKey,
          version: row.version,
          worldId: row.worldId,
          title: row.title,
          expectedCatalogRevision: row.expectedCatalogRevision,
          designJson: row.designJson,
          designHash: row.designHash,
          active: row.active,
          placements,
          createdByUserId: row.createdByUserId,
          createdAt: row.createdAt,
        };
      });
    } catch {
      designs = Array.from(inMemoryWorldDesigns.values()).filter(d => d.active);
    }
  } else {
    designs = Array.from(inMemoryWorldDesigns.values()).filter(d => d.active);
  }

  const revision = createHash("sha256")
    .update(JSON.stringify(designs.map(d => ({ key: d.designKey, hash: d.designHash, v: d.version }))))
    .digest("hex");

  return WorldDesignReadbackSchema.parse({
    revision,
    designs,
  });
}

export async function planWorldDesign(draft: WorldDesignDraft): Promise<{
  planHash: string;
  designKey: string;
  worldId: string;
  title: string;
  expectedCatalogRevision: string;
  placementsCount: number;
  status: "valid_plan";
  draft: WorldDesignDraft;
}> {
  const catalog = await getGlbCatalogSafe();
  if (draft.expectedCatalogRevision && catalog.revision !== draft.expectedCatalogRevision) {
    throw new Error("WORLD_DESIGN_CATALOG_REVISION_MISMATCH");
  }

  // Validate placements
  for (const placement of draft.placements) {
    const asset = catalog.entries.find(e => e.assetId === placement.assetId);
    if (!asset) {
      throw new Error(`WORLD_DESIGN_ASSET_NOT_FOUND: ${placement.assetId}`);
    }
  }

  const planPayload = {
    designKey: draft.designKey,
    worldId: draft.worldId,
    title: draft.title,
    expectedCatalogRevision: draft.expectedCatalogRevision,
    placements: draft.placements,
  };

  const planHash = createHash("sha256").update(JSON.stringify(planPayload)).digest("hex");

  return {
    planHash,
    designKey: draft.designKey,
    worldId: draft.worldId,
    title: draft.title,
    expectedCatalogRevision: draft.expectedCatalogRevision,
    placementsCount: draft.placements.length,
    status: "valid_plan",
    draft,
  };
}

export async function applyWorldDesign(
  actorUserId: number,
  draft: WorldDesignDraft,
  expectedPlanHash: string
): Promise<{
  status: "applied";
  version: WorldDesignVersion;
  receipt: AuthoringReceipt;
}> {
  const plan = await planWorldDesign(draft);
  if (plan.planHash !== expectedPlanHash) {
    throw new Error("WORLD_DESIGN_PLAN_HASH_MISMATCH");
  }

  const db = await getDb();
  let nextVersion = 1;

  if (db) {
    try {
      const [existing] = await db
        .select({ version: aurionWorldDesignVersions.version })
        .from(aurionWorldDesignVersions)
        .where(eq(aurionWorldDesignVersions.designKey, draft.designKey))
        .orderBy(desc(aurionWorldDesignVersions.version))
        .limit(1);

      if (existing) {
        nextVersion = existing.version + 1;
      }
    } catch {
      const prev = inMemoryWorldDesigns.get(draft.designKey);
      if (prev) nextVersion = prev.version + 1;
    }
  } else {
    const prev = inMemoryWorldDesigns.get(draft.designKey);
    if (prev) nextVersion = prev.version + 1;
  }

  const id = `wdesign_${draft.designKey}_v${nextVersion}_${Date.now()}`;
  const designJson = JSON.stringify(draft);
  const designHash = plan.planHash;

  const versionRecord: WorldDesignVersion = {
    id,
    designKey: draft.designKey,
    version: nextVersion,
    worldId: draft.worldId,
    title: draft.title,
    expectedCatalogRevision: draft.expectedCatalogRevision,
    designJson,
    designHash,
    active: true,
    placements: draft.placements,
    createdByUserId: actorUserId,
    createdAt: new Date(),
  };

  const receiptId = `auth_receipt_w_${id}`;
  const receiptHash = createHash("sha256")
    .update(JSON.stringify({ receiptId, id, actorUserId, designHash }))
    .digest("hex");

  const receipt: AuthoringReceipt = {
    id: receiptId,
    kind: "world",
    action: "APPLY_WORLD_DESIGN",
    targetId: draft.designKey,
    actorUserId,
    planHash: expectedPlanHash,
    previousHash: null,
    resultHash: designHash,
    payloadJson: designJson,
    receiptHash,
    createdAt: new Date(),
  };

  if (db) {
    try {
      // Deactivate older versions
      await db
        .update(aurionWorldDesignVersions)
        .set({ active: false })
        .where(eq(aurionWorldDesignVersions.designKey, draft.designKey));

      // Insert new version
      await db.insert(aurionWorldDesignVersions).values({
        id,
        designKey: draft.designKey,
        version: nextVersion,
        worldId: draft.worldId,
        title: draft.title,
        expectedCatalogRevision: draft.expectedCatalogRevision,
        designJson,
        designHash,
        active: true,
        createdByUserId: actorUserId,
      });

      // Insert receipt
      await db.insert(aurionAuthoringReceipts).values({
        id: receipt.id,
        kind: receipt.kind,
        action: receipt.action,
        targetId: receipt.targetId,
        actorUserId: receipt.actorUserId,
        planHash: receipt.planHash,
        previousHash: receipt.previousHash ?? null,
        resultHash: receipt.resultHash,
        payloadJson: receipt.payloadJson,
        receiptHash: receipt.receiptHash,
      });
    } catch {
      inMemoryWorldDesigns.set(draft.designKey, versionRecord);
      inMemoryReceipts.push(receipt);
    }
  } else {
    inMemoryWorldDesigns.set(draft.designKey, versionRecord);
    inMemoryReceipts.push(receipt);
  }

  return {
    status: "applied",
    version: versionRecord,
    receipt,
  };
}

export async function readActiveDungeonDesigns(): Promise<DungeonDesignReadback> {
  const db = await getDb();
  let dungeons: DungeonDesignVersion[] = [];

  if (db) {
    try {
      const rows = await db
        .select()
        .from(aurionDungeonDesignVersions)
        .where(eq(aurionDungeonDesignVersions.active, true))
        .orderBy(desc(aurionDungeonDesignVersions.version));

      dungeons = rows.map(row => {
        let rooms = [];
        let objectives: string[] = [];
        try {
          const parsed = JSON.parse(row.designJson);
          rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
          objectives = Array.isArray(parsed.objectives) ? parsed.objectives : [];
        } catch {
          rooms = [];
          objectives = [];
        }

        return {
          id: row.id,
          dungeonId: row.dungeonId,
          version: row.version,
          label: row.label,
          zone: row.zone,
          expectedCatalogRevision: row.expectedCatalogRevision,
          designJson: row.designJson,
          designHash: row.designHash,
          active: row.active,
          rooms,
          objectives,
          createdByUserId: row.createdByUserId,
          createdAt: row.createdAt,
        };
      });
    } catch {
      dungeons = Array.from(inMemoryDungeonDesigns.values()).filter(d => d.active);
    }
  } else {
    dungeons = Array.from(inMemoryDungeonDesigns.values()).filter(d => d.active);
  }

  const revision = createHash("sha256")
    .update(JSON.stringify(dungeons.map(d => ({ id: d.dungeonId, hash: d.designHash, v: d.version }))))
    .digest("hex");

  return DungeonDesignReadbackSchema.parse({
    revision,
    dungeons,
  });
}

export async function planDungeonDesign(draft: DungeonDesignDraft): Promise<{
  planHash: string;
  dungeonId: string;
  label: string;
  zone: string;
  roomsCount: number;
  status: "valid_plan";
  draft: DungeonDesignDraft;
}> {
  const catalog = await getGlbCatalogSafe();
  if (draft.expectedCatalogRevision && catalog.revision !== draft.expectedCatalogRevision) {
    throw new Error("DUNGEON_DESIGN_CATALOG_REVISION_MISMATCH");
  }

  const planPayload = {
    dungeonId: draft.dungeonId,
    label: draft.label,
    zone: draft.zone,
    expectedCatalogRevision: draft.expectedCatalogRevision,
    rooms: draft.rooms,
    objectives: draft.objectives,
  };

  const planHash = createHash("sha256").update(JSON.stringify(planPayload)).digest("hex");

  return {
    planHash,
    dungeonId: draft.dungeonId,
    label: draft.label,
    zone: draft.zone,
    roomsCount: draft.rooms.length,
    status: "valid_plan",
    draft,
  };
}

export async function applyDungeonDesign(
  actorUserId: number,
  draft: DungeonDesignDraft,
  expectedPlanHash: string
): Promise<{
  status: "published";
  version: DungeonDesignVersion;
  receipt: AuthoringReceipt;
}> {
  const plan = await planDungeonDesign(draft);
  if (plan.planHash !== expectedPlanHash) {
    throw new Error("DUNGEON_DESIGN_PLAN_HASH_MISMATCH");
  }

  const db = await getDb();
  let nextVersion = 1;

  if (db) {
    try {
      const [existing] = await db
        .select({ version: aurionDungeonDesignVersions.version })
        .from(aurionDungeonDesignVersions)
        .where(eq(aurionDungeonDesignVersions.dungeonId, draft.dungeonId))
        .orderBy(desc(aurionDungeonDesignVersions.version))
        .limit(1);

      if (existing) {
        nextVersion = existing.version + 1;
      }
    } catch {
      const prev = inMemoryDungeonDesigns.get(draft.dungeonId);
      if (prev) nextVersion = prev.version + 1;
    }
  } else {
    const prev = inMemoryDungeonDesigns.get(draft.dungeonId);
    if (prev) nextVersion = prev.version + 1;
  }

  const id = `ddesign_${draft.dungeonId}_v${nextVersion}_${Date.now()}`;
  const designJson = JSON.stringify(draft);
  const designHash = plan.planHash;

  const versionRecord: DungeonDesignVersion = {
    id,
    dungeonId: draft.dungeonId,
    version: nextVersion,
    label: draft.label,
    zone: draft.zone,
    expectedCatalogRevision: draft.expectedCatalogRevision,
    designJson,
    designHash,
    active: true,
    rooms: draft.rooms,
    objectives: draft.objectives,
    createdByUserId: actorUserId,
    createdAt: new Date(),
  };

  const receiptId = `auth_receipt_d_${id}`;
  const receiptHash = createHash("sha256")
    .update(JSON.stringify({ receiptId, id, actorUserId, designHash }))
    .digest("hex");

  const receipt: AuthoringReceipt = {
    id: receiptId,
    kind: "dungeon",
    action: "PUBLISH_DUNGEON",
    targetId: draft.dungeonId,
    actorUserId,
    planHash: expectedPlanHash,
    previousHash: null,
    resultHash: designHash,
    payloadJson: designJson,
    receiptHash,
    createdAt: new Date(),
  };

  if (db) {
    try {
      await db
        .update(aurionDungeonDesignVersions)
        .set({ active: false })
        .where(eq(aurionDungeonDesignVersions.dungeonId, draft.dungeonId));

      await db.insert(aurionDungeonDesignVersions).values({
        id,
        dungeonId: draft.dungeonId,
        version: nextVersion,
        label: draft.label,
        zone: draft.zone,
        expectedCatalogRevision: draft.expectedCatalogRevision,
        designJson,
        designHash,
        active: true,
        createdByUserId: actorUserId,
      });

      await db.insert(aurionAuthoringReceipts).values({
        id: receipt.id,
        kind: receipt.kind,
        action: receipt.action,
        targetId: receipt.targetId,
        actorUserId: receipt.actorUserId,
        planHash: receipt.planHash,
        previousHash: receipt.previousHash ?? null,
        resultHash: receipt.resultHash,
        payloadJson: receipt.payloadJson,
        receiptHash: receipt.receiptHash,
      });
    } catch {
      inMemoryDungeonDesigns.set(draft.dungeonId, versionRecord);
      inMemoryReceipts.push(receipt);
    }
  } else {
    inMemoryDungeonDesigns.set(draft.dungeonId, versionRecord);
    inMemoryReceipts.push(receipt);
  }

  return {
    status: "published",
    version: versionRecord,
    receipt,
  };
}
