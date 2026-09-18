import { createHash } from "node:crypto";
import { z } from "zod";
import { glbImportStore } from "./glbImportStore";
import { questNpcPositions } from "./questNpcAuthority";
import { readConfirmedNpcState } from "./wasdAurionRuntime";

const SHA256 = /^[a-f0-9]{64}$/;

export const namedNpcVisualInputSchema = z.object({
  assetId: z.string().min(8).max(64),
  npcId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/),
}).strict();

export type NamedNpcVisualInput = z.infer<typeof namedNpcVisualInputSchema>;

export type NamedNpcVisualPlan = Readonly<{
  schemaVersion: "aurion.named-npc-visual-plan.v1";
  planHash: string;
  catalogRevision: string;
  npcId: string;
  targetKey: string;
  assetId: string;
  assetSha256: string;
  expectedActiveAssetId: string | null;
  requiresHumanConfirmation: true;
}>;

async function assertCanonicalNpc(npcId: string): Promise<void> {
  if (Object.prototype.hasOwnProperty.call(questNpcPositions, npcId)) return;
  if (await readConfirmedNpcState(npcId)) return;
  throw new Error("GLB_NPC_ID_NOT_CONFIRMED");
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function planNamedNpcVisual(raw: NamedNpcVisualInput): Promise<NamedNpcVisualPlan> {
  const input = namedNpcVisualInputSchema.parse(raw);
  await assertCanonicalNpc(input.npcId);
  const targetKey = `npc_${input.npcId}`;
  const catalog = await glbImportStore().catalog();

  const candidates = catalog.entries.filter(entry => entry.assetId === input.assetId);
  if (candidates.length !== 1) throw new Error(candidates.length ? "GLB_NPC_ASSET_IDENTITY_AMBIGUOUS" : "GLB_NPC_ASSET_NOT_FOUND");
  const asset = candidates[0]!;
  if (asset.assetType !== "character" || asset.purpose !== "npc-fallback") throw new Error("GLB_NPC_FALLBACK_CHARACTER_REQUIRED");
  if (asset.targetKey !== null && asset.targetKey !== targetKey) throw new Error("GLB_NPC_ASSET_ALREADY_ASSIGNED");

  const active = catalog.entries.filter(entry => entry.assetType === "character" && entry.targetKey === targetKey);
  if (active.length > 1) throw new Error("GLB_NPC_ASSIGNMENT_DRIFT");
  const identity = {
    schemaVersion: "aurion.named-npc-visual-plan.v1" as const,
    catalogRevision: catalog.revision,
    npcId: input.npcId,
    targetKey,
    assetId: asset.assetId,
    assetSha256: asset.sha256,
    expectedActiveAssetId: active[0]?.assetId ?? null,
    requiresHumanConfirmation: true as const,
  };
  return Object.freeze({ ...identity, planHash: hash(identity) });
}

export async function applyNamedNpcVisual(
  actorUserId: number,
  raw: NamedNpcVisualInput,
  expectedPlanHash: string,
): Promise<Readonly<{
  schemaVersion: "aurion.named-npc-visual-assignment.v1";
  planHash: string;
  npcId: string;
  targetKey: string;
  assetId: string;
  assetSha256: string;
  catalogRevision: string;
  humanConfirmed: true;
}>> {
  if (!Number.isSafeInteger(actorUserId) || actorUserId < 1) throw new Error("GLB_NPC_ACTOR_INVALID");
  if (!SHA256.test(expectedPlanHash)) throw new Error("GLB_NPC_PLAN_HASH_INVALID");
  const plan = await planNamedNpcVisual(raw);
  if (plan.planHash !== expectedPlanHash) throw new Error("GLB_NPC_PLAN_CHANGED");

  await glbImportStore().assignNamedNpcVisual(actorUserId, {
    assetId: plan.assetId,
    npcId: plan.npcId,
    expectedActiveAssetId: plan.expectedActiveAssetId,
  });

  const catalog = await glbImportStore().catalog();
  const assigned = catalog.entries.filter(entry => entry.assetType === "character" && entry.targetKey === plan.targetKey);
  if (assigned.length !== 1 || assigned[0]!.assetId !== plan.assetId || assigned[0]!.sha256 !== plan.assetSha256) {
    throw new Error("GLB_NPC_ASSIGNMENT_READBACK_FAILED");
  }

  return Object.freeze({
    schemaVersion: "aurion.named-npc-visual-assignment.v1",
    planHash: plan.planHash,
    npcId: plan.npcId,
    targetKey: plan.targetKey,
    assetId: plan.assetId,
    assetSha256: plan.assetSha256,
    catalogRevision: catalog.revision,
    humanConfirmed: true,
  });
}
