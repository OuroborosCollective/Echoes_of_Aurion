import { describe, expect, it } from "vitest";
import { audioCueForFootstep, audioCueForWeapon, isAudioEvent } from "@shared/audioProtocol";

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

  it("maps weapon disciplines without client-side gameplay effects", () => {
    expect(audioCueForWeapon("spear")).toEqual({ cue: "combat.attack.spear", category: "combat", weapon: "spear" });
    expect(audioCueForWeapon("focus")).toEqual({ cue: "combat.attack.focus", category: "combat", weapon: "focus" });
  });

  it("accepts only category-prefixed audio events", () => {
    expect(isAudioEvent({ cue: "progression.level_up", category: "progression", level: 3 })).toBe(true);
    expect(isAudioEvent({ cue: "combat.attack.spear", category: "movement", weapon: "spear" })).toBe(false);
    expect(isAudioEvent({ cue: "movement.footstep.grass" })).toBe(false);
    expect(isAudioEvent(null)).toBe(false);
  });
});
