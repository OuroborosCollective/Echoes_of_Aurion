import { describe, expect, it } from "vitest";
import { CARAVAN_ITEM_REWARD_TEMPLATE, DEFAULT_SEED_TEMPLATES, QuestTemplateRegistry } from "./templateRegistry";
import { PILOT_WOLF_QUEST_TEMPLATE } from "./pilotQuestTemplate";
import { computeCanonicalHash } from "../../shared/aurionQuestCanonicalHash";

describe("immutable authored item rewards", () => {
  it("keeps published caravan v1 unchanged when a stored v1 is hydrated", () => {
    const stored = structuredClone(DEFAULT_SEED_TEMPLATES[0]!);
    expect(stored.version).toBe(1);
    expect(stored.outcomes[0]!.rewards).toEqual([{ type: "xp", amount: 500 }, { type: "gold", amount: 150 }]);
    const originalHash = computeCanonicalHash("aurion.quest.template.v1", stored);
    const registry = new QuestTemplateRegistry();
    registry.registerTemplate(stored);
    expect(computeCanonicalHash("aurion.quest.template.v1", registry.getTemplate(stored.templateId, 1))).toBe(originalHash);
    expect(registry.getTemplate(stored.templateId, 2)).toEqual(CARAVAN_ITEM_REWARD_TEMPLATE);
    expect(registry.getActiveTemplates().filter(t => t.templateId === stored.templateId).map(t => t.version)).toEqual([1]);
    expect(CARAVAN_ITEM_REWARD_TEMPLATE.active).toBe(false);
  });
  it("binds the unpublished six-wolf pilot to one existing catalog item reward", () => {
    expect(PILOT_WOLF_QUEST_TEMPLATE.outcomes[0]!.rewards).toEqual([
      { type: "item", amount: 1, targetId: "component-craft-star-iron-v2" },
    ]);
  });
});
