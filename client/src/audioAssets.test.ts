import { describe, expect, it } from "vitest";
import { aurionAssets } from "@/lib/aurionAssets";

describe("Aurion SFX asset catalog", () => {
  it("maps the requested combat, creature, loot, resource and crafting cues to local WAV assets", () => {
    const sfx = aurionAssets.audio.sfx;
    expect(sfx["combat.attack.sharp"]).toContain("combat-attack-sharp.wav");
    expect(sfx["combat.attack.pointed"]).toContain("combat-attack-pointed.wav");
    expect(sfx["combat.attack.blunt"]).toContain("combat-attack-blunt.wav");
    expect(sfx["combat.spell.heal"]).toContain("combat-spell-heal.wav");
    expect(sfx["combat.spell.buff"]).toContain("combat-spell-buff.wav");
    expect(sfx["combat.creature.wolf.attack"]).toContain("combat-creature-wolf-attack.wav");
    expect(sfx["combat.creature.human.attack"]).toContain("combat-creature-human-attack.wav");
    expect(sfx["combat.creature.monster.attack"]).toContain("combat-creature-monster-attack.wav");
    expect(sfx["combat.creature.wolf.death"]).toContain("combat-creature-wolf-death.wav");
    expect(sfx["combat.creature.human.death"]).toContain("combat-creature-human-death.wav");
    expect(sfx["combat.creature.monster.death"]).toContain("combat-creature-monster-death.wav");
    expect(sfx["movement.run.earth"]).toContain("movement-run-earth.wav");
    expect(sfx["movement.run.grass"]).toContain("movement-run-grass.wav");
    expect(sfx["movement.run.stone"]).toContain("movement-run-stone.wav");
    expect(sfx["movement.run.wood"]).toContain("movement-run-wood.wav");
    expect(sfx["movement.run.water"]).toContain("movement-run-water.wav");
    expect(sfx["interaction.loot.screw_pouch"]).toContain("interaction-loot-screw-pouch.wav");
    expect(sfx["resource.harvest.plant"]).toContain("resource-harvest-plant.wav");
    expect(sfx["resource.harvest.wood"]).toContain("resource-harvest-wood.wav");
    expect(sfx["resource.mine.ore"]).toContain("resource-mine-ore.wav");
    expect(sfx["crafting.workbench.saw"]).toContain("crafting-workbench-saw.wav");
  });
});
