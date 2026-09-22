import { createHash } from "node:crypto";
import { z } from "zod";
import { glbImportStore } from "./glbImportStore";

export const namedNpcVisualInputSchema = z.object({
  npcId: z.string().trim().min(2).max(64).regex(/^[a-z0-9_-]+$/),
  assetId: z.string().trim().min(8).max(64),
  targetKey: z.string().trim().min(2).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  expectedCatalogRevision: z.string().optional(),
}).strict();

export type NamedNpcVisualInput = z.infer<typeof namedNpcVisualInputSchema>;

export type NamedNpcVisualPlanResult = Readonly<{
  planHash: string;
  npcId: string;
  targetKey: string;
  assetId: string;
  assetSha256: string;
  displayName: string;
  previousAssetId: string | null;
  catalogRevision: string;
  status: "ready";
}>;

export type NamedNpcVisualApplyResult = Readonly<{
  status: "assigned";
  planHash: string;
  npcId: string;
  targetKey: string;
  assetId: string;
  assignedByUserId: number;
}>;

export async function planNamedNpcVisual(input: NamedNpcVisualInput): Promise<NamedNpcVisualPlanResult> {
  const store = glbImportStore();
  const catalog = await store.catalog();
  if (input.expectedCatalogRevision && catalog.revision !== input.expectedCatalogRevision) {
    throw new Error("NAMED_NPC_CATALOG_REVISION_MISMATCH");
  }

  const asset = catalog.entries.find(entry => entry.assetId === input.assetId);
  if (!asset) {
    throw new Error("NAMED_NPC_ASSET_NOT_FOUND");
  }
  if (asset.assetType !== "character") {
    throw new Error("NAMED_NPC_ASSET_MUST_BE_CHARACTER");
  }

  const targetKey = input.targetKey || `npc_${input.npcId}`;
  const previous = catalog.entries.find(entry => entry.targetKey === targetKey);
  const previousAssetId = previous ? previous.assetId : null;

  const planPayload = {
    npcId: input.npcId,
    targetKey,
    assetId: asset.assetId,
    assetSha256: asset.sha256,
    previousAssetId,
    catalogRevision: catalog.revision,
  };

  const planHash = createHash("sha256").update(JSON.stringify(planPayload)).digest("hex");

  return Object.freeze({
    planHash,
    npcId: input.npcId,
    targetKey,
    assetId: asset.assetId,
    assetSha256: asset.sha256,
    displayName: asset.displayName,
    previousAssetId,
    catalogRevision: catalog.revision,
    status: "ready",
  });
}

export async function applyNamedNpcVisual(
  actorUserId: number,
  binding: NamedNpcVisualInput,
  expectedPlanHash: string
): Promise<NamedNpcVisualApplyResult> {
  const plan = await planNamedNpcVisual(binding);
  if (plan.planHash !== expectedPlanHash) {
    throw new Error("NAMED_NPC_PLAN_HASH_MISMATCH");
  }

  const store = glbImportStore();
  await store.assign(actorUserId, {
    assetId: binding.assetId,
    targetType: "character",
    targetKey: plan.targetKey,
    expectedActiveAssetId: plan.previousAssetId,
  });

  return Object.freeze({
    status: "assigned",
    planHash: plan.planHash,
    npcId: binding.npcId,
    targetKey: plan.targetKey,
    assetId: binding.assetId,
    assignedByUserId: actorUserId,
  });
}
