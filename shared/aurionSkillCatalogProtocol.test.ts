import { describe, expect, it } from "vitest";
import {
  AURION_BLADE_SKILL_CATALOG_HASH,
  AURION_BLADE_SKILL_CATALOG_VERSION,
  AURION_BLADE_SKILL_CATALOG,
  resolveAurionBladeSkill,
} from "./aurionSkillCatalogProtocol";

describe("aurionSkillCatalogProtocol", () => {
  it("pins the migrated Blade catalog and converts logical cooldowns deterministically", () => {
    expect(AURION_BLADE_SKILL_CATALOG_VERSION).toBe("aurion.skills.blade.v1");
    expect(AURION_BLADE_SKILL_CATALOG_HASH).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      AURION_BLADE_SKILL_CATALOG.find(skill => skill.skillId === "k_strike")
    ).toMatchObject({
      weaponTrack: "blade",
      enabled: true,
      execution: "melee",
      cooldownTicks: 8,
      rangeFixed: 4500,
    });
    expect(
      AURION_BLADE_SKILL_CATALOG.find(skill => skill.skillId === "k_charge")
    ).toMatchObject({ enabled: false, execution: "unsupported" });
  });

  it("normalizes legacy skill ids into the active Aurion catalog while rejecting stale or disabled semantics", () => {
    const migrated = resolveAurionBladeSkill({ skillId: "k_strike" });
    expect(migrated.intent).toEqual({
      skillId: "k_strike",
      catalogVersion: AURION_BLADE_SKILL_CATALOG_VERSION,
      catalogHash: AURION_BLADE_SKILL_CATALOG_HASH,
    });
    expect(
      resolveAurionBladeSkill({
        skillId: "k_strike",
        catalogVersion: AURION_BLADE_SKILL_CATALOG_VERSION,
      })
    ).toEqual(migrated);
    expect(() =>
      resolveAurionBladeSkill({
        skillId: "k_strike",
        catalogVersion: "ax1.legacy",
      })
    ).toThrow("AURION_SKILL_CATALOG_STALE");
    expect(() =>
      resolveAurionBladeSkill({
        skillId: "k_charge",
        catalogVersion: AURION_BLADE_SKILL_CATALOG_VERSION,
      })
    ).toThrow("AURION_SKILL_DISABLED");
    expect(() =>
      resolveAurionBladeSkill({
        skillId: "unknown",
        catalogVersion: AURION_BLADE_SKILL_CATALOG_VERSION,
      })
    ).toThrow("AURION_SKILL_UNKNOWN");
  });
});
