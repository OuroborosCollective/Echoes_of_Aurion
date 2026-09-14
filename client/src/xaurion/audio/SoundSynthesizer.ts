// Owner ZIP compatibility adapter: preserve the xaurion sound API while routing every cue into AurionSoundscape.
type AurionAudioDetail =
  | { cue: "combat.spell.buff" | "combat.magic" | "combat.attack.blade" | "combat.monster"; category: "combat"; element?: string; weapon?: string; monsterClass?: string }
  | { cue: "interaction.loot.screw_pouch" | "interaction.npc.neutral" | "interaction.npc.masculine" | "interaction.npc.feminine"; category: "interaction"; voice?: "neutral" | "masculine" | "feminine" }
  | { cue: "progression.level_up"; category: "progression"; level?: number }
  | { cue: "movement.footstep.stone" | "movement.run.stone"; category: "movement"; surface?: string };

class SoundSynthesizer {
  private isMuted = false;

  private emit(detail: AurionAudioDetail): void {
    if (this.isMuted || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("aurion:audio-cue", { detail }));
  }

  public setMuted(muted: boolean): void { this.isMuted = muted; }
  public getMuted(): boolean { return this.isMuted; }

  // UI Interactions
  public playUiClick(): void { this.emit({ cue: "interaction.npc.neutral", category: "interaction", voice: "neutral" }); }
  public playUiOpen(): void { this.emit({ cue: "interaction.npc.neutral", category: "interaction", voice: "neutral" }); }
  public playUiClose(): void { this.emit({ cue: "interaction.npc.neutral", category: "interaction", voice: "neutral" }); }
  public playUiSuccess(): void { this.emit({ cue: "progression.level_up", category: "progression", level: 1 }); }
  public playUiWarning(): void { this.emit({ cue: "combat.magic", category: "combat", element: "resonance" }); }

  // Gameplay
  public startShieldSound(): void { this.emit({ cue: "combat.spell.buff", category: "combat", element: "resonance" }); }
  public stopShieldSound(): void {}
  public playMountSound(): void { this.emit({ cue: "interaction.npc.neutral", category: "interaction", voice: "neutral" }); }
  public playLootPickup(): void { this.emit({ cue: "interaction.loot.screw_pouch", category: "interaction" }); }
  public playNpcInteract(voice: "masculine" | "feminine" | "neutral" = "neutral"): void {
    const cueMap = { masculine: "interaction.npc.masculine", feminine: "interaction.npc.feminine", neutral: "interaction.npc.neutral" } as const;
    this.emit({ cue: cueMap[voice], category: "interaction", voice });
  }
  public playSkillCast(type: string): void {
    this.emit(type === "buff"
      ? { cue: "combat.spell.buff", category: "combat", element: "resonance" }
      : type === "melee"
        ? { cue: "combat.attack.blade", category: "combat", weapon: "blade" }
        : { cue: "combat.magic", category: "combat", element: "resonance" });
  }
  public playHitSound(): void { this.emit({ cue: "combat.attack.blade", category: "combat", weapon: "blade" }); }
  public playMobDeath(): void { this.emit({ cue: "combat.monster", category: "combat", monsterClass: "xaurion" }); }
  public playLevelUp(): void { this.emit({ cue: "progression.level_up", category: "progression", level: 1 }); }
  public playQuestComplete(): void { this.emit({ cue: "progression.level_up", category: "progression", level: 1 }); }
  public playItemEquip(): void { this.emit({ cue: "interaction.loot.screw_pouch", category: "interaction" }); }
  public playItemPickup(): void { this.emit({ cue: "interaction.loot.screw_pouch", category: "interaction" }); }
  public playInventorySort(): void { this.emit({ cue: "interaction.loot.screw_pouch", category: "interaction" }); }

  // Navigation / World
  public playNavigationStep(): void { this.emit({ cue: "movement.footstep.stone", category: "movement", surface: "stone" }); }
  public changeAmbient(url: string, volume?: number): void {
    window.dispatchEvent(new CustomEvent("aurion:ambient-change", { detail: { url, volume } }));
  }
  public stopAmbient(): void {
    window.dispatchEvent(new CustomEvent("aurion:ambient-change", { detail: { stop: true } }));
  }
}

export const soundSynth = new SoundSynthesizer();
