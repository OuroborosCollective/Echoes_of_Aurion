import { readConfirmedNpcState, resolveAndRecordNpc, resolveAndRecordPolity, resolveAndRecordWorld } from "./wasdAurionRuntime";
import { prepareMerchantNpcDecision, npcIdentity, type HubId, type LivingWorldSocialAction } from "./wasdNpcCapsule";

export type LivingWorldRuntimeResult = Readonly<{
  resolution: ReturnType<typeof prepareMerchantNpcDecision>["resolution"];
  npc: Awaited<ReturnType<typeof resolveAndRecordNpc>>;
  polity: Awaited<ReturnType<typeof resolveAndRecordPolity>>;
  world: Awaited<ReturnType<typeof resolveAndRecordWorld>>;
  socialEvidence?: ReturnType<typeof prepareMerchantNpcDecision>["socialEvidence"];
}>;

/** Host orchestration only: confirmed state into WASD, returned requests into persistence. */
export async function resolveAndRecordAx1LivingWorld(input: Readonly<{
  worldSeed: string; resolutionIndex: number; regionId: HubId;
  social?: Readonly<{ action: LivingWorldSocialAction; sourceReceiptId: string }>;
}>): Promise<LivingWorldRuntimeResult> {
  const prior = await readConfirmedNpcState(npcIdentity(input.regionId));
  const prepared = prepareMerchantNpcDecision({ ...input, prior });
  const npc = await resolveAndRecordNpc(prepared.npcRequest);
  const world = await resolveAndRecordWorld(prepared.worldRequest);
  const polity = await resolveAndRecordPolity(prepared.polityRequest);
  return Object.freeze({ resolution: prepared.resolution, npc, world, polity,
    ...(prepared.socialEvidence ? { socialEvidence: prepared.socialEvidence } : {}) });
}
