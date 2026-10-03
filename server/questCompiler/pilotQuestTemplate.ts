import type { QuestTemplateVersion } from "../../shared/aurionQuestContract";

export const PILOT_WOLF_QUEST_TEMPLATE: QuestTemplateVersion = Object.freeze({
  templateId: "starter-wolves-6",
  version: 1,
  title: "Mechanische Wölfe",
  description: "Besiege sechs Clockwork Stalker und kehre zur Nordtorwache zurück.",
  prerequisiteFacts: [],
  roles: [{
    roleName: "giver",
    entityType: "npc",
    optional: false,
    predicates: [{ subjectField: "id", operator: "eq", expectedValue: "starter_village_north_gate_guard" }],
  }],
  nodes: [
    { id: "start", type: "start", title: "Auftrag der Nordtorwache", requirements: [], actionsOnEnter: [], actionsOnExit: [] },
    { id: "defeat_wolves", type: "objective", title: "Wölfe besiegen", requirements: [], objective: {
      key: "wolf_victories",
      targetValue: 6,
      description: "Besiege sechs Clockwork Stalker (mechanische Wölfe).",
      eventBinding: { source: "combat", event: "victory", matchField: "opponentSpecies", matchValue: "clockwork_stalker" },
    }, actionsOnEnter: [], actionsOnExit: [] },
    { id: "end", type: "end", title: "Zur Nordtorwache zurückkehren", requirements: [], actionsOnEnter: [], actionsOnExit: [] },
  ],
  edges: [
    { id: "accept", fromNodeId: "start", toNodeId: "defeat_wolves", priority: 1 },
    { id: "wolves_defeated", fromNodeId: "defeat_wolves", toNodeId: "end", priority: 1 },
  ],
  outcomes: [{ id: "success", semanticFlag: "starter_wolves_6_completed", factEffects: [], rewards: [{ type: "item", amount: 1, targetId: "component-craft-star-iron-v2" }] }],
  maxCompositionDepth: 10,
  active: true,
  quarantined: false,
} satisfies QuestTemplateVersion);
