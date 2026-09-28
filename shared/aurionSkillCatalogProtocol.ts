import {
  AX1_BLADE_SKILLS,
  AX1_BLADE_SKILL_SOURCE_GIT_BLOB_SHA,
} from "./ax1BladeSkillProtocol";

export const AURION_BLADE_SKILL_CATALOG_VERSION =
  "aurion.skills.blade.v1" as const;
export const AURION_BLADE_SKILL_CATALOG_SOURCE_REVISION =
  AX1_BLADE_SKILL_SOURCE_GIT_BLOB_SHA;
export const AURION_SKILL_TICK_MS = 100 as const;
export const AURION_BLADE_SKILL_CATALOG = Object.freeze(
  AX1_BLADE_SKILLS.map(skill =>
    Object.freeze({
      skillId: skill.skillId,
      command: skill.command,
      name: skill.name,
      kind: skill.kind,
      weaponTrack: "blade" as const,
      rangeFixed: skill.rangeFixed,
      cooldownMs: skill.cooldownMs,
      cooldownTicks: Math.max(
        1,
        Math.ceil(skill.cooldownMs / AURION_SKILL_TICK_MS)
      ),
      sourceResourceType: skill.sourceResourceType,
      sourceResourceCost: skill.sourceResourceCost,
      enabled: skill.skillId === "k_strike",
      prerequisites: Object.freeze({ weaponTrack: "blade" as const }),
      execution:
        skill.skillId === "k_strike"
          ? ("melee" as const)
          : ("unsupported" as const),
    })
  )
);
export type AurionBladeSkillDefinition =
  (typeof AURION_BLADE_SKILL_CATALOG)[number];
export type AurionBladeSkillId = AurionBladeSkillDefinition["skillId"];
export const AURION_BLADE_SKILL_CATALOG_HASH = "sha256:a77a5a0d10dc739522ac73351c495553ff26464df9cf5d44da4ab2d38c264b82" as const;

export type AurionSkillIntentInput = Readonly<{
  skillId: string;
  catalogVersion?: string;
}>;
export type AurionCanonicalSkillIntent = Readonly<{
  skillId: AurionBladeSkillId;
  catalogVersion: typeof AURION_BLADE_SKILL_CATALOG_VERSION;
  catalogHash: typeof AURION_BLADE_SKILL_CATALOG_HASH;
}>;

export function aurionBladeSkillById(
  skillId: string
): AurionBladeSkillDefinition | undefined {
  return AURION_BLADE_SKILL_CATALOG.find(skill => skill.skillId === skillId);
}

export function resolveAurionBladeSkill(input: AurionSkillIntentInput): {
  definition: AurionBladeSkillDefinition;
  intent: AurionCanonicalSkillIntent;
} {
  if (
    input.catalogVersion !== undefined &&
    input.catalogVersion !== AURION_BLADE_SKILL_CATALOG_VERSION
  )
    throw new Error("AURION_SKILL_CATALOG_STALE");
  const definition = aurionBladeSkillById(input.skillId);
  if (!definition) throw new Error("AURION_SKILL_UNKNOWN");
  if (!definition.enabled || definition.execution === "unsupported")
    throw new Error("AURION_SKILL_DISABLED");
  return Object.freeze({
    definition,
    intent: Object.freeze({
      skillId: definition.skillId,
      catalogVersion: AURION_BLADE_SKILL_CATALOG_VERSION,
      catalogHash: AURION_BLADE_SKILL_CATALOG_HASH,
    }),
  });
}

export function isAurionBladeSkillCatalogVersion(
  value: unknown
): value is typeof AURION_BLADE_SKILL_CATALOG_VERSION {
  return value === AURION_BLADE_SKILL_CATALOG_VERSION;
}

export function isAurionBladeSkillId(value: unknown): value is AurionBladeSkillId {
  if (typeof value !== "string") return false;
  try {
    resolveAurionBladeSkill({ skillId: value });
    return true;
  } catch {
    return false;
  }
}
