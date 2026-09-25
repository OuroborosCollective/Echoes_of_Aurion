import {
  executeConfirmedMerchantAction,
  type ConfirmedMerchantActionResult,
  type EditorialConsent,
} from "./npcActionGatewayPersistence";
import type { HubId } from "./wasdNpcCapsule";

export type LivingWorldRuntimeResult = Extract<
  ConfirmedMerchantActionResult,
  { status: "committed" | "persisted" }
>;

/**
 * Legacy-named compatibility adapter. Aurion validates, executes and persists the
 * living-world action; historical source identities are provenance only.
 */
export async function resolveAndRecordAx1LivingWorld(input: Readonly<{
  worldSeed: string;
  regionId: HubId;
  sourceDecisionReceiptId: string;
  consent?: EditorialConsent;
}>): Promise<LivingWorldRuntimeResult> {
  const result = await executeConfirmedMerchantAction({
    worldSeed: input.worldSeed,
    homeHubId: input.regionId,
    sourceDecisionReceiptId: input.sourceDecisionReceiptId,
    ...(input.consent ? { consent: input.consent } : {}),
  });
  if (result.status === "blocked") {
    throw new Error(`NPC_ACTION_GATEWAY_BLOCKED:${result.code}`);
  }
  if (result.status === "denied") {
    throw new Error("NPC_ACTION_EDITORIAL_CONSENT_DENIED");
  }
  return result;
}
