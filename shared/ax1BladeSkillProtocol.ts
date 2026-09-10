export const AX1_BLADE_SKILL_SOURCE_REVISION = "d356881538dae23c3aa97364a5596d48b6ac3079" as const;
export const AX1_BLADE_SKILL_SOURCE_PATH = "src/data/mmorpgData.ts" as const;
export const AX1_BLADE_SKILL_SOURCE_GIT_BLOB_SHA = "2e44ad352041c33a5a9e441c3d28ca1392dd1efe" as const;

export const AX1_BLADE_SKILLS = Object.freeze([
  Object.freeze({ command: "1", skillId: "k_strike", name: "Hydraulic Cleave", kind: "melee", rangeFixed: 4_500, cooldownMs: 800, sourceResourceType: "steam", sourceResourceCost: 10 }),
  Object.freeze({ command: "2", skillId: "k_charge", name: "Steam Jet Charge", kind: "projectile", rangeFixed: 16_000, cooldownMs: 5_000, sourceResourceType: "steam", sourceResourceCost: 25 }),
  Object.freeze({ command: "3", skillId: "k_shield", name: "Aegis Barrier", kind: "buff", rangeFixed: 0, cooldownMs: 8_000, sourceResourceType: "steam", sourceResourceCost: 35 }),
  Object.freeze({ command: "4", skillId: "k_whirlwind", name: "Clockwork Storm", kind: "aoe", rangeFixed: 0, cooldownMs: 12_000, sourceResourceType: "steam", sourceResourceCost: 50 }),
  Object.freeze({ command: "5", skillId: "k_overdrive", name: "Steam Overclock", kind: "buff", rangeFixed: 0, cooldownMs: 20_000, sourceResourceType: "steam", sourceResourceCost: 0 }),
] as const);

export type Ax1BladeSkill = (typeof AX1_BLADE_SKILLS)[number];
export type Ax1BladeSkillId = Ax1BladeSkill["skillId"];
export type Ax1BladeSkillCommand = Ax1BladeSkill["command"];

export function ax1BladeSkillById(skillId: string): Ax1BladeSkill | undefined {
  return AX1_BLADE_SKILLS.find(skill => skill.skillId === skillId);
}

export function ax1BladeSkillForCommand(command: string): Ax1BladeSkill | undefined {
  return AX1_BLADE_SKILLS.find(skill => skill.command === command);
}

export function isAx1BladeSkillId(value: unknown): value is Ax1BladeSkillId {
  return typeof value === "string" && AX1_BLADE_SKILLS.some(skill => skill.skillId === value);
}
