export type QuestKey = "astral_call" | "archive_of_echoes" | "ember_key";
export type QuestState = "locked" | "available" | "active" | "completed";
export type McpAction = "run" | "attack" | "interact" | "skill_1" | "skill_2" | "skill_3" | "skill_4" | "skill_5" | "skill_6" | "skill_7" | "skill_8" | "skill_9";
export type EncounterKey = "asterion" | "archive" | "solarium" | "cinder_vault";

export type QuestDefinition = {
  key: QuestKey;
  giver: "Lyra" | "Orun";
  title: string;
  objective: string;
  requiredLevel: number;
  requires: QuestKey | null;
  reward: { xp: number; points: number; dungeonKey?: "ember_key" };
};

export const aurionQuestline: readonly QuestDefinition[] = [
  {
    key: "astral_call",
    giver: "Lyra",
    title: "Der Ruf der Sternwarte",
    objective: "Besiege den Asterion-Sentinel und bringe Lyra einen Resonanzsplitter.",
    requiredLevel: 1,
    requires: null,
    reward: { xp: 120, points: 20 },
  },
  {
    key: "archive_of_echoes",
    giver: "Orun",
    title: "Das Archiv der Echos",
    objective: "Sichere die versunkene Archivhalle und entschlüssele die Echo-Tafel.",
    requiredLevel: 2,
    requires: "astral_call",
    reward: { xp: 220, points: 35 },
  },
  {
    key: "ember_key",
    giver: "Lyra",
    title: "Schlüssel aus der letzten Flamme",
    objective: "Stabilisiere das Solarium. Der Glutschlüssel öffnet den ersten Dungeon.",
    requiredLevel: 3,
    requires: "archive_of_echoes",
    reward: { xp: 360, points: 60, dungeonKey: "ember_key" },
  },
] as const;

export const dungeonDefinition = {
  key: "cinder_vault",
  requiredQuest: "ember_key" as QuestKey,
  requiredKey: "ember_key" as const,
  name: "Aschengewölbe",
  objective: "Erkunde das Gewölbe, besiege den Glutwächter und sichere den ersten Setfund.",
} as const;

export const dungeonCompletionReward = {
  xp: 480,
  points: 90,
  treasureTier: "first_cinder_vault",
} as const;

/** Visible boss phases map to one server-owned encounter; rendering never mints a reward. */
export const aurionEncounters: readonly {
  key: EncounterKey;
  name: string;
  enemyName: string;
  maxBossHp: number;
  questKey: QuestKey | null;
  requiresDungeonKey?: "ember_key";
}[] = [
  { key: "asterion", name: "Sternwarte Asterion", enemyName: "Asterion-Sentinel", maxBossHp: 112, questKey: "astral_call" },
  { key: "archive", name: "Versunkene Archivhalle", enemyName: "Archiv-Sentinel", maxBossHp: 154, questKey: "archive_of_echoes" },
  { key: "solarium", name: "Solarium der letzten Flamme", enemyName: "Solar-Sentinel", maxBossHp: 198, questKey: "ember_key" },
  { key: "cinder_vault", name: "Aschengewölbe", enemyName: "Glutwächter", maxBossHp: 258, questKey: null, requiresDungeonKey: "ember_key" },
] as const;

const actionDamage: Record<McpAction, number> = {
  run: 0,
  interact: 0,
  attack: 17,
  skill_1: 15,
  skill_2: 0,
  skill_3: 0,
  skill_4: 0,
  skill_5: 22,
  skill_6: 0,
  skill_7: 10,
  skill_8: 29,
  skill_9: 43,
};

export function getQuest(key: QuestKey): QuestDefinition {
  const quest = aurionQuestline.find(candidate => candidate.key === key);
  if (!quest) throw new Error("Unknown Aurion quest");
  return quest;
}

export function getEncounter(key: EncounterKey) {
  const encounter = aurionEncounters.find(candidate => candidate.key === key);
  if (!encounter) throw new Error("Unknown Aurion encounter");
  return encounter;
}

export function damageForMcpAction(action: McpAction): number {
  return actionDamage[action];
}

export function resolveQuestState(input: { key: QuestKey; level: number; completed: readonly QuestKey[]; active: QuestKey | null }): QuestState {
  const quest = getQuest(input.key);
  if (input.completed.includes(quest.key)) return "completed";
  if (input.active === quest.key) return "active";
  if (input.level < quest.requiredLevel) return "locked";
  if (quest.requires && !input.completed.includes(quest.requires)) return "locked";
  return "available";
}

export function mayEnterDungeon(input: { level: number; completed: readonly QuestKey[]; keys: readonly string[] }): boolean {
  return input.level >= 3 && input.completed.includes(dungeonDefinition.requiredQuest) && input.keys.includes(dungeonDefinition.requiredKey);
}

export function mcpActionFromCommand(command: string): McpAction | null {
  const normalized = command.trim().toUpperCase();
  if (normalized === "W" || normalized === "A" || normalized === "S" || normalized === "D") return "run";
  if (normalized === "F") return "attack";
  if (normalized === "E") return "interact";
  if (/^[1-9]$/.test(normalized)) return `skill_${normalized}` as McpAction;
  return null;
}
