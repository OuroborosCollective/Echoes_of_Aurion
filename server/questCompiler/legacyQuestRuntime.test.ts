import { describe, expect, it } from "vitest";
import { listLegacyQuestBridges } from "../legacyQuestBridge";
import { LEGACY_CANONICAL_QUEST_TEMPLATES } from "./legacyQuestTemplate";

describe("AIM-298 legacy QuestKey canonical adapter", () => {
  it("represents every established QuestKey losslessly in the canonical contract", () => {
    const bridges = listLegacyQuestBridges();
    expect(bridges).toHaveLength(6);
    expect(LEGACY_CANONICAL_QUEST_TEMPLATES).toHaveLength(6);

    for (const bridge of bridges) {
      const template = LEGACY_CANONICAL_QUEST_TEMPLATES.find(candidate => candidate.templateId === `tpl_legacy_${bridge.key}`);
      expect(template).toBeDefined();
      expect(template!.title).toBe(bridge.title);
      expect(template!.description).toBe(bridge.objective);

      const objective = template!.nodes.find(node => node.type === "objective")!.objective!;
      expect(objective.eventBinding).toEqual(bridge.eventBinding);
      expect(objective.key).toBe("encounter_completed");
      expect(objective.targetValue).toBe(1);

      const rewards = template!.outcomes[0]!.rewards;
      expect(rewards).toContainEqual({ type: "xp", amount: bridge.reward.xp });
      expect(rewards).toContainEqual({ type: "aurion_points", amount: bridge.reward.points });
      expect(rewards).toContainEqual({ type: "season_points", amount: bridge.reward.points });
      expect(rewards).toContainEqual({ type: "victory", amount: 1 });
      if (bridge.reward.dungeonKey) {
        expect(rewards).toContainEqual({ type: "item", amount: 1, targetId: bridge.reward.dungeonKey });
      }
    }
  });
});
