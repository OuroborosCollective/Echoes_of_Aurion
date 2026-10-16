import { worldServiceNpcs } from "../shared/worldServiceNpcs";
import { aurionStarterVillageQuestNpcs } from "./aurionStarterVillageContract";

/** Only onboarding/service anchors have a permanent home. This does not gate
 * visitors, generic NPC decisions, trade, memory, or outside-world generation. */
const permanentHomes: ReadonlyMap<string, string> = new Map([
  ...Object.values(aurionStarterVillageQuestNpcs).map(npc => [npc.id, npc.zoneId] as const),
  ...worldServiceNpcs.map(npc => [npc.id, "observatory_threshold"] as const),
]);

export function assertStarterVillageNpcResidence(npcId: string, regionId: string): void {
  const home = permanentHomes.get(npcId);
  if (home && home !== regionId) throw new Error("STARTER_VILLAGE_ANCHOR_RESIDENCE_REQUIRED");
}
