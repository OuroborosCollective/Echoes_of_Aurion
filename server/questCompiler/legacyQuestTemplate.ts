import type { QuestTemplateVersion } from "../../shared/aurionQuestContract";
import { listLegacyQuestBridges } from "../legacyQuestBridge";
import type { LegacyQuestBridge } from "../../shared/aurionLegacyQuestBridgeContract";

const giverNpcId = (giver: LegacyQuestBridge["giver"]): "lyra" | "orun" => giver.toLowerCase() as "lyra" | "orun";

export function buildLegacyQuestTemplate(bridge: LegacyQuestBridge): QuestTemplateVersion {
  return {
    templateId: `tpl_legacy_${bridge.key}`,
    version: 1,
    title: bridge.title,
    description: bridge.objective,
    prerequisiteFacts: [],
    roles: [{
      roleName: "giver",
      entityType: "npc",
      optional: false,
      predicates: [{ subjectField: "id", operator: "eq", expectedValue: giverNpcId(bridge.giver) }],
    }],
    nodes: [
      { id: "node_start", type: "start", title: `Quest annehmen: ${bridge.title}`, requirements: [], actionsOnEnter: [], actionsOnExit: [], narrativeKey: `legacy.quest.${bridge.key}.start` },
      { id: "node_encounter", type: "objective", title: bridge.objective, requirements: [], objective: { key: "encounter_completed", targetValue: 1, description: bridge.objective, eventBinding: bridge.eventBinding }, actionsOnEnter: [], actionsOnExit: [], narrativeKey: `legacy.quest.${bridge.key}.objective` },
      { id: "node_end", type: "end", title: `Übergabe: ${bridge.title}`, requirements: [], actionsOnEnter: [], actionsOnExit: [], narrativeKey: `legacy.quest.${bridge.key}.end` },
    ],
    edges: [
      { id: "edge_start", fromNodeId: "node_start", toNodeId: "node_encounter", priority: 1 },
      { id: "edge_complete", fromNodeId: "node_encounter", toNodeId: "node_end", priority: 1 },
    ],
    outcomes: [{
      id: "outcome_success",
      semanticFlag: `legacy_${bridge.key}_completed`,
      factEffects: [],
      rewards: [
        { type: "xp", amount: bridge.reward.xp },
        { type: "aurion_points", amount: bridge.reward.points },
        { type: "season_points", amount: bridge.reward.points },
        { type: "victory", amount: 1 },
        ...(bridge.reward.dungeonKey ? [{ type: "item" as const, amount: 1, targetId: bridge.reward.dungeonKey }] : []),
      ],
      narrativeKey: `legacy.quest.${bridge.key}.outcome`,
    }],
    maxCompositionDepth: 10,
    active: true,
    quarantined: false,
  };
}

export const LEGACY_CANONICAL_QUEST_TEMPLATES = Object.freeze(listLegacyQuestBridges().map(buildLegacyQuestTemplate));
