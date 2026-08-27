import { describe, expect, it } from "vitest";
import { audioCueForCreature, audioCueForFootstep, audioCueForWeapon, isAudioEvent } from "@shared/audioProtocol";

describe("Aurion audio protocol", () => {
  it("maps every supported surface to a movement cue deterministically", () => {
    expect(["earth", "grass", "stone", "wood", "water"].map(audioCueForFootstep)).toEqual([
      { cue: "movement.footstep.earth", category: "movement", surface: "earth" },
      { cue: "movement.footstep.grass", category: "movement", surface: "grass" },
      { cue: "movement.footstep.stone", category: "movement", surface: "stone" },
      { cue: "movement.footstep.wood", category: "movement", surface: "wood" },
      { cue: "movement.footstep.water", category: "movement", surface: "water" },
    ]);
  });

  it("maps sharp, pointed and blunt weapon families without client-side gameplay effects", () => {
    expect(audioCueForWeapon("sharp")).toEqual({ cue: "combat.attack.sharp", category: "combat", weapon: "sharp" });
    expect(audioCueForWeapon("pointed")).toEqual({ cue: "combat.attack.pointed", category: "combat", weapon: "pointed" });
    expect(audioCueForWeapon("blunt")).toEqual({ cue: "combat.attack.blunt", category: "combat", weapon: "blunt" });
  });

  it("maps creature attacks and deaths to explicit wolf, human and monster cues", () => {
    expect(audioCueForCreature("wolf", "attack")).toEqual({ cue: "combat.creature.wolf.attack", category: "combat", creature: "wolf", action: "attack" });
    expect(audioCueForCreature("human", "death")).toEqual({ cue: "combat.creature.human.death", category: "combat", creature: "human", action: "death" });
    expect(audioCueForCreature("monster", "death")).toEqual({ cue: "combat.creature.monster.death", category: "combat", creature: "monster", action: "death" });
  });

  it("accepts all requested non-authoritative resource and spell events", () => {
    expect(isAudioEvent({ cue: "combat.spell.heal", category: "combat", spell: "heal" })).toBe(true);
    expect(isAudioEvent({ cue: "combat.spell.buff", category: "combat", spell: "buff" })).toBe(true);
    expect(isAudioEvent({ cue: "interaction.loot.screw_pouch", category: "interaction", lootKind: "screw_pouch" })).toBe(true);
    expect(isAudioEvent({ cue: "resource.harvest.plant", category: "resource", resource: "plant" })).toBe(true);
    expect(isAudioEvent({ cue: "resource.harvest.wood", category: "resource", resource: "wood" })).toBe(true);
    expect(isAudioEvent({ cue: "resource.mine.ore", category: "resource", resource: "ore" })).toBe(true);
    expect(isAudioEvent({ cue: "crafting.workbench.saw", category: "crafting", station: "workbench" })).toBe(true);
  });

  it("rejects category-mismatched or incomplete payloads", () => {
    expect(isAudioEvent({ cue: "combat.attack.spear", category: "movement", weapon: "spear" })).toBe(false);
    expect(isAudioEvent({ cue: "movement.footstep.grass" })).toBe(false);
    expect(isAudioEvent(null)).toBe(false);
  });
});
